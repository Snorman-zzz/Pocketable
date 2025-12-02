import { Router, Request, Response } from 'express';
import { databaseService } from '../services/database';
import { routeMessage, classifyIntent, generatePocketableResponseStream } from '../services/openai-routing';
import { authenticateToken, verifyProjectOwnership } from '../middleware/auth';

const router = Router();

/**
 * Unified message endpoint: handles both BUILD and GENERAL queries
 */
router.post('/:projectId/message', authenticateToken, verifyProjectOwnership, async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const { projectId } = req.params;
    const { message, model } = req.body;

    if (!message || !projectId) {
      return res.status(400).json({
        error: 'Message and projectId are required'
      });
    }

    console.log(`[MESSAGE] Project: ${projectId}, Message: "${message.substring(0, 50)}..."`);

    // === STEP 1: Save user message immediately ===
    const userMsgResult = await databaseService.query(
      `INSERT INTO chat_messages (project_id, role, content)
       VALUES ($1, 'user', $2)
       RETURNING id, created_at`,
      [projectId, message]
    );
    const userMessageId = userMsgResult.rows[0].id;

    // === STEP 2: Load context (parallel queries) ===
    const [historyResult, filesResult] = await Promise.all([
      // Last 50 messages for conversation context (will be auto-compacted if needed)
      databaseService.query(
        `SELECT role, content
         FROM chat_messages
         WHERE project_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [projectId]
      ),
      // All project files
      databaseService.query(
        `SELECT file_path, content
         FROM project_files
         WHERE project_id = $1`,
        [projectId]
      ),
    ]);

    const conversationHistory = historyResult.rows.reverse();
    const projectFiles = Object.fromEntries(
      filesResult.rows.map((f: any) => [f.file_path, f.content])
    );

    // === STEP 3: Route the message ===
    // Read routing flag at runtime (not at module load time)
    const ROUTING_ENABLED = process.env.ROUTING_ENABLED === 'true';

    if (!ROUTING_ENABLED) {
      // Routing disabled - always BUILD (existing behavior)
      console.log('[MESSAGE] Routing disabled, defaulting to BUILD');
      return res.json({
        success: true,
        intent: 'BUILD',
        confidence: 1.0,
        routingEnabled: false,
      });
    }

    console.log('[MESSAGE] Routing enabled, classifying intent...');

    const routing = await routeMessage(
      projectId,
      message,
      conversationHistory,
      projectFiles
    );

    console.log(`[MESSAGE] Routed to ${routing.intent} (confidence: ${routing.confidence.toFixed(2)}, latency: ${routing.latencyMs}ms)${routing.compacted ? ' [AUTO-COMPACTED]' : ''}`);

    // === STEP 4: Update user message with routing metadata ===
    await databaseService.query(
      `UPDATE chat_messages
       SET routing_intent = $1,
           routing_confidence = $2,
           router_model = 'gpt-5'
       WHERE id = $3`,
      [routing.intent, routing.confidence, userMessageId]
    );

    // === STEP 5: Handle BUILD vs GENERAL ===
    if (routing.intent === 'BUILD') {
      // BUILD: Client will call /api/generate-daytona
      return res.json({
        success: true,
        intent: 'BUILD',
        confidence: routing.confidence,
        latencyMs: routing.latencyMs,
        routingEnabled: true,
      });
    } else {
      // GENERAL: Save Pocketable response and return
      const assistantMsgResult = await databaseService.query(
        `INSERT INTO chat_messages
         (project_id, role, content, model, routing_intent, routing_confidence, router_model)
         VALUES ($1, 'assistant', $2, 'gpt-5', 'GENERAL', $3, 'gpt-5')
         RETURNING id, content, created_at`,
        [projectId, routing.response, routing.confidence]
      );

      const totalLatency = Date.now() - startTime;
      console.log(`[MESSAGE] GENERAL response completed - ${totalLatency}ms total`);

      return res.json({
        success: true,
        intent: 'GENERAL',
        confidence: routing.confidence,
        message: assistantMsgResult.rows[0],
        latencyMs: routing.latencyMs,
        totalLatencyMs: totalLatency,
        compacted: routing.compacted,
        routingEnabled: true,
      });
    }

  } catch (error) {
    const totalLatency = Date.now() - startTime;
    console.error('[MESSAGE] Error:', error);

    res.status(500).json({
      error: 'Failed to process message',
      latencyMs: totalLatency,
    });
  }
});

/**
 * Streaming message endpoint for GENERAL queries
 * Uses Server-Sent Events (SSE) to stream Pocketable responses in real-time
 */
router.post('/:projectId/message/stream', authenticateToken, verifyProjectOwnership, async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const { projectId } = req.params;
    const { message, model } = req.body;

    if (!message || !projectId) {
      return res.status(400).json({
        error: 'Message and projectId are required'
      });
    }

    console.log(`[STREAM] Project: ${projectId}, Message: "${message.substring(0, 50)}..."`);

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // === STEP 1: Save user message immediately ===
    const userMsgResult = await databaseService.query(
      `INSERT INTO chat_messages (project_id, role, content)
       VALUES ($1, 'user', $2)
       RETURNING id, created_at`,
      [projectId, message]
    );
    const userMessageId = userMsgResult.rows[0].id;

    // === STEP 2: Load context (parallel queries) ===
    const [historyResult, filesResult] = await Promise.all([
      databaseService.query(
        `SELECT role, content
         FROM chat_messages
         WHERE project_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [projectId]
      ),
      databaseService.query(
        `SELECT file_path, content
         FROM project_files
         WHERE project_id = $1`,
        [projectId]
      ),
    ]);

    const conversationHistory = historyResult.rows.reverse();
    const projectFiles = Object.fromEntries(
      filesResult.rows.map((f: any) => [f.file_path, f.content])
    );

    // === STEP 3: Classify intent ===
    const ROUTING_ENABLED = process.env.ROUTING_ENABLED === 'true';

    if (!ROUTING_ENABLED) {
      console.log('[STREAM] Routing disabled');
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Streaming not available when routing is disabled' })}\n\n`);
      return res.end();
    }

    const classification = await classifyIntent(message, conversationHistory);
    console.log(`[STREAM] Classified as ${classification.intent} (confidence: ${classification.confidence.toFixed(2)})`);

    // Send classification result
    res.write(`data: ${JSON.stringify({
      type: 'classification',
      intent: classification.intent,
      confidence: classification.confidence
    })}\n\n`);

    if (classification.intent === 'BUILD') {
      // BUILD queries don't stream via this endpoint
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'BUILD queries should use generate-daytona endpoint' })}\n\n`);
      return res.end();
    }

    // === STEP 4: Update user message with routing metadata ===
    await databaseService.query(
      `UPDATE chat_messages
       SET routing_intent = $1,
           routing_confidence = $2,
           router_model = 'gpt-5'
       WHERE id = $3`,
      [classification.intent, classification.confidence, userMessageId]
    );

    // === STEP 5: Stream GENERAL response ===
    let fullResponse = '';
    let fullReasoning = ''; // Track full reasoning content
    let wasCompacted = false;

    try {
      for await (const event of generatePocketableResponseStream(
        projectId,
        message,
        conversationHistory,
        projectFiles
      )) {
        // Forward reasoning events to frontend
        if (event.reasoning_chunk) {
          fullReasoning += event.reasoning_chunk;
          res.write(`data: ${JSON.stringify({ type: 'reasoning_chunk', chunk: event.reasoning_chunk })}\n\n`);
        }

        if (event.reasoning_start) {
          res.write(`data: ${JSON.stringify({ type: 'reasoning_start' })}\n\n`);
        }

        if (event.reasoning_complete) {
          res.write(`data: ${JSON.stringify({ type: 'reasoning_complete' })}\n\n`);
        }

        // Forward text chunks
        if (event.chunk) {
          fullResponse += event.chunk;
          res.write(`data: ${JSON.stringify({ type: 'chunk', chunk: event.chunk })}\n\n`);
        }
        if (event.compacted !== undefined) {
          wasCompacted = event.compacted;
        }
        if (event.error) {
          res.write(`data: ${JSON.stringify({ type: 'error', error: event.error })}\n\n`);
          return res.end();
        }
      }

      // === STEP 6: Save assistant message ===
      const assistantMsgResult = await databaseService.query(
        `INSERT INTO chat_messages
         (project_id, role, content, model, reasoning, routing_intent, routing_confidence, router_model)
         VALUES ($1, 'assistant', $2, 'gpt-5', $3, 'GENERAL', $4, 'gpt-5')
         RETURNING id, created_at`,
        [projectId, fullResponse, fullReasoning || null, classification.confidence]
      );

      const totalLatency = Date.now() - startTime;
      console.log(`[STREAM] GENERAL response completed - ${totalLatency}ms total${wasCompacted ? ' [COMPACTED]' : ''}`);

      // Send completion event
      res.write(`data: ${JSON.stringify({
        type: 'complete',
        messageId: assistantMsgResult.rows[0].id,
        latencyMs: totalLatency,
        compacted: wasCompacted
      })}\n\n`);

      res.end();

    } catch (streamError) {
      console.error('[STREAM] Streaming error:', streamError);
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Streaming interrupted' })}\n\n`);
      res.end();
    }

  } catch (error) {
    const totalLatency = Date.now() - startTime;
    console.error('[STREAM] Error:', error);

    try {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: 'Failed to process message',
        latencyMs: totalLatency
      })}\n\n`);
      res.end();
    } catch (e) {
      // Response already ended
      console.error('[STREAM] Could not send error event:', e);
    }
  }
});

export default router;
