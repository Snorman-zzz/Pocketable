import OpenAI from 'openai';
import { databaseService } from './database';

// System prompts
const ROUTER_PROMPT = `You are a strict router. Classify USER_MESSAGE as BUILD or GENERAL.

BUILD criteria (any match = BUILD):
- Direct action keywords: create, build, make, modify, change, update, fix, adjust, tweak, add, remove, delete, refactor, implement, execute, run, regenerate, debug, test
- Action patterns: "make X [verb]", "change X to Y", "update the X", "now add", "also include"
- Technical references: code, files, packages, preview, sandbox, errors, dev tooling, UI elements (button, background, color, layout, screen, component)
- Iterative requests: modifications to existing features (e.g., "make the background pink" implies existing UI)
- Project context: references to "the app", "the game", "the project", "this feature"
- Plan confirmations: "yes", "sure", "ok", "build it", "let's do it", "go ahead", "please", "implement it", "make it", "do it", "proceed", "continue", "that works", "sounds good"
  * CRITICAL: If user says affirmative words ("yes", "implement", "build it", etc.) and RECENT CONTEXT shows a plan or proposal was presented, classify as BUILD with HIGH confidence (0.85+)

GENERAL criteria (any match = GENERAL):
- Greetings/social: hi, hello, hey, thanks, thank you
- Meta questions: what is Pocketable, how does X work, help, documentation, explain
- Non-coding discussion: personal questions, unrelated topics
- Planning/advisory requests:
  * "give me a plan", "suggest", "recommend", "advise", "what should I", "help me plan", "outline", "propose"
  * "how should I", "what would be best", "which approach", "what are my options"
  * "tell me about", "explain how to", "what's the best way"
- Research queries: "look up", "search for", "find", "research", "show me docs"
- Exploratory questions: "how to build X", "how do I make Y" (present plan first, then await confirmation)
  * CRITICAL: Questions asking HOW to do something are GENERAL (user wants guidance), not BUILD

Examples:
- "Make the background pink" → BUILD (direct action + UI element)
- "Change the color to blue" → BUILD (direct action + style)
- "Build a tic tac toe game" → BUILD (direct creation)
- "Now add a reset button" → BUILD (continuation + action)
- "Fix the layout" → BUILD (fix + UI)
- "Build it" → BUILD (plan confirmation - check context)
- "Yes" or "yes please" → BUILD IF context shows prior plan, else GENERAL (0.85+ confidence if plan exists)
- "Implement it" → BUILD (action confirmation - check context)
- "Let's do it" → BUILD (affirmative + action)
- "That sounds good, build it" → BUILD (approval + action)
- "Give me a suggested plan on the MVP" → GENERAL (requesting planning help)
- "Suggest features for my app" → GENERAL (requesting recommendations)
- "What should I build first?" → GENERAL (asking for guidance)
- "How should I structure this?" → GENERAL (asking for advice)
- "Recommend an architecture" → GENERAL (requesting recommendations)
- "How to make Snapchat?" → GENERAL (exploratory planning question)
- "Look up Daytona API docs" → GENERAL (research query)
- "Search for Stripe integration" → GENERAL (research query)
- "Find the latest Expo features" → GENERAL (research query)
- "What is Pocketable?" → GENERAL (meta question)
- "Hello" → GENERAL (greeting)
- "Thanks" → GENERAL (gratitude)

Return JSON: { "intent": "BUILD" | "GENERAL", "confidence": number }.`;

const POCKETABLE_PROMPT = `You are Pocketable, a helpful mobile app builder assistant.
Be concise and friendly. Use project context and past conversation.
Never write or modify code; for code changes, the user should issue a BUILD request.

**Web Search Capability:**
You have access to web search to look up current information, API documentation, and best practices.
Use web search when:
- User explicitly requests research ("look up", "search for", "find documentation")
- You need current API documentation or specifications
- You need to verify current best practices or latest features
- Creating implementation plans that require external knowledge

When presenting implementation plans or roadmaps, end your response with:
"Would you like me to implement this plan?"`;

// Singleton OpenAI client
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    console.log('✅ OpenAI Routing client initialized');
  }
  return openaiClient;
}

// Context window limits (conservative estimates for gpt-5)
const MAX_CONTEXT_TOKENS = 120000; // gpt-5 context window
const COMPACTION_THRESHOLD = 0.95; // Compact at 95% capacity (Claude Code approach)

/**
 * Estimate token count (rough: ~4 chars per token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Calculate total context tokens
 */
function calculateContextSize(
  conversationHistory: Array<{ role: string; content: string }>,
  projectFiles: Record<string, string>
): number {
  // History tokens
  const historyTokens = conversationHistory.reduce(
    (sum, msg) => sum + estimateTokens(msg.content),
    0
  );

  // Files tokens (truncated)
  const filesTokens = Object.values(projectFiles).reduce(
    (sum, content) => sum + estimateTokens(content.substring(0, 3000)),
    0
  );

  // System prompt + formatting overhead
  const overheadTokens = 2000;

  return historyTokens + filesTokens + overheadTokens;
}

/**
 * Compact conversation history using Claude Code approach:
 * - Triggers at 95% context capacity
 * - Creates summary of older messages
 * - Keeps recent messages verbatim
 * - Stores summary in database for persistence
 */
async function compactConversationIfNeeded(
  projectId: string,
  conversationHistory: Array<{ role: string; content: string }>,
  projectFiles: Record<string, string>
): Promise<Array<{ role: string; content: string }>> {

  const currentTokens = calculateContextSize(conversationHistory, projectFiles);
  const capacityUsed = currentTokens / MAX_CONTEXT_TOKENS;

  console.log(`[CONTEXT] Using ${currentTokens} tokens (${(capacityUsed * 100).toFixed(1)}% capacity)`);

  // Check if compaction needed (95% threshold like Claude Code)
  if (capacityUsed < COMPACTION_THRESHOLD) {
    return conversationHistory; // No compaction needed
  }

  console.log(`[COMPACT] Auto-compacting conversation at ${(capacityUsed * 100).toFixed(1)}% capacity`);

  // Check if already compacted (has system message with summary)
  const hasExistingSummary = conversationHistory.some(
    msg => msg.role === 'system' && msg.content.includes('Previous conversation summary:')
  );

  if (hasExistingSummary) {
    // Already compacted once - keep summary + last 5 messages
    const summaryMsg = conversationHistory.find(
      msg => msg.role === 'system' && msg.content.includes('Previous conversation summary:')
    );
    const recentMessages = conversationHistory.slice(-5);

    console.log(`[COMPACT] Already compacted, keeping summary + last 5 messages`);
    return [summaryMsg!, ...recentMessages];
  }

  // First compaction - keep last 5 messages, summarize the rest
  const recentMessages = conversationHistory.slice(-5);
  const oldMessages = conversationHistory.slice(0, -5);

  if (oldMessages.length === 0) {
    return conversationHistory; // Nothing to compact
  }

  // Build conversation text to summarize
  const conversationText = oldMessages
    .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join('\n\n');

  try {
    const client = getOpenAIClient();
    const compactionStart = Date.now();

    const response = await client.responses.create({
      model: 'gpt-5-mini', // Use gpt-5-mini for cost-effective compaction
      input: `Summarize this conversation history concisely, preserving:
- User's main goals and requests
- Features/components that were built
- Current project state and structure
- Important decisions, patterns, or constraints
- Any recurring issues or preferences

Conversation:
${conversationText}

Provide a concise summary in 2-4 paragraphs. Be specific about what was built and current state.`,
      reasoning: { effort: 'low' }, // Need decent quality for summary
      text: { verbosity: 'medium' },
    });

    const summary = response.output_text || 'Previous conversation context unavailable.';
    const compactionLatency = Date.now() - compactionStart;

    console.log(`[COMPACT] Compressed ${oldMessages.length} messages → ${summary.length} chars (${compactionLatency}ms)`);

    // Store compaction summary in database for persistence
    await databaseService.query(
      `INSERT INTO chat_messages (project_id, role, content, model)
       VALUES ($1, 'system', $2, 'gpt-5-mini')`,
      [projectId, `Previous conversation summary:\n${summary}`]
    );

    // Return: summary + recent messages
    return [
      { role: 'system', content: `Previous conversation summary:\n${summary}` },
      ...recentMessages,
    ];

  } catch (error) {
    console.error('[COMPACT] Compaction failed:', error);
    // Fallback: just keep last 10 messages
    console.log('[COMPACT] Fallback: keeping last 10 messages');
    return conversationHistory.slice(-10);
  }
}

interface RoutingResult {
  intent: 'BUILD' | 'GENERAL';
  confidence: number;
  response?: string;
  responseId?: string;
  latencyMs?: number;
  compacted?: boolean;
}

/**
 * Classify user intent using gpt-5 with minimal reasoning
 * Now accepts optional conversation history for context-aware routing
 */
export async function classifyIntent(
  userMessage: string,
  conversationHistory?: Array<{ role: string; content: string }>
): Promise<{ intent: 'BUILD' | 'GENERAL'; confidence: number; latencyMs: number }> {
  const startTime = Date.now();
  const client = getOpenAIClient();

  try {
    // Build context from recent conversation (last 3 messages for efficiency)
    let contextInfo = '';
    if (conversationHistory && conversationHistory.length > 0) {
      const lastFewMessages = conversationHistory.slice(-3);
      contextInfo = '\n\nRECENT CONTEXT (for context-aware routing):\n' +
        lastFewMessages
          .map(m => `${m.role.toUpperCase()}: ${m.content.substring(0, 200)}${m.content.length > 200 ? '...' : ''}`)
          .join('\n');

      console.log(`[ROUTING] Using ${lastFewMessages.length} messages for context`);
    }

    const response = await client.responses.create({
      model: 'gpt-5', // Upgraded from gpt-5-nano for better understanding
      input: `${ROUTER_PROMPT}${contextInfo}\n\nUSER_MESSAGE: ${userMessage}`,
      reasoning: { effort: 'minimal' }, // Fast routing with minimal reasoning
      text: { verbosity: 'low' }, // Concise JSON output
    });

    const latencyMs = Date.now() - startTime;
    const outputText = response.output_text || '';

    try {
      const result = JSON.parse(outputText);
      if (result.intent && result.confidence !== undefined) {
        console.log(`[ROUTING] ${result.intent} (${result.confidence.toFixed(2)}) - ${latencyMs}ms${contextInfo ? ' [with context]' : ''}`);
        return {
          intent: result.intent,
          confidence: result.confidence,
          latencyMs,
        };
      }
    } catch (parseError) {
      console.error('[ROUTING] JSON parse failed:', outputText);
    }

    // Fallback: keyword detection
    const upper = outputText.toUpperCase();
    if (upper.includes('BUILD')) {
      return { intent: 'BUILD', confidence: 0.5, latencyMs };
    }
    if (upper.includes('GENERAL')) {
      return { intent: 'GENERAL', confidence: 0.5, latencyMs };
    }

    console.warn('[ROUTING] Could not parse, defaulting to BUILD');
    return { intent: 'BUILD', confidence: 0.3, latencyMs };

  } catch (error) {
    const latencyMs = Date.now() - startTime;
    console.error('[ROUTING] Classification failed:', error);
    // Default to GENERAL (conversational) on failure - safer than BUILD
    return { intent: 'GENERAL', confidence: 0.5, latencyMs };
  }
}

/**
 * Generate Pocketable conversational response using gpt-5
 * Returns streaming iterator when stream=true
 */
export async function* generatePocketableResponseStream(
  projectId: string,
  userMessage: string,
  conversationHistory: Array<{ role: string; content: string }>,
  projectFiles: Record<string, string>,
  previousResponseId?: string
): AsyncIterableIterator<{
  chunk?: string;
  complete?: boolean;
  compacted?: boolean;
  reasoning_start?: boolean;
  reasoning_complete?: boolean;
  error?: string
}> {
  const startTime = Date.now();
  const client = getOpenAIClient();

  try {
    // Auto-compact if needed (Claude Code approach)
    const compactedHistory = await compactConversationIfNeeded(
      projectId,
      conversationHistory,
      projectFiles
    );
    const wasCompacted = compactedHistory.length !== conversationHistory.length;

    // Build context
    const contextParts: string[] = [POCKETABLE_PROMPT];

    // Add project files (truncated per file)
    if (Object.keys(projectFiles).length > 0) {
      contextParts.push('\n## Project Files Context:');
      for (const [filePath, content] of Object.entries(projectFiles)) {
        const truncated = content.length > 3000
          ? content.substring(0, 3000) + '\n... (truncated)'
          : content;
        contextParts.push(`\n### ${filePath}\n\`\`\`\n${truncated}\n\`\`\``);
      }
    }

    // Add (possibly compacted) conversation history
    if (compactedHistory.length > 0) {
      contextParts.push('\n## Conversation History:');
      for (const msg of compactedHistory) {
        const roleLabel = msg.role.toUpperCase();
        contextParts.push(`${roleLabel}: ${msg.content}`);
      }
    }

    // Add current query
    contextParts.push(`\nUSER: ${userMessage}`);

    const fullInput = contextParts.join('\n');

    const requestParams: any = {
      model: 'gpt-5',
      input: fullInput,
      text: { verbosity: 'medium' },
      stream: true, // Enable streaming
      tools: [
        {
          type: 'web_search' // Enable web search for research
        }
      ]
    };

    if (previousResponseId) {
      requestParams.previous_response_id = previousResponseId;
    }

    const stream = await client.responses.create(requestParams);

    let fullResponse = '';

    // Stream chunks - OpenAI uses event-based streaming
    for await (const event of stream) {
      // Detect reasoning start
      if (event.type === 'response.output_item.added' && (event as any).item?.type === 'reasoning') {
        console.log('[THINKING] GPT-5 started reasoning');
        yield { reasoning_start: true };
      }

      // Detect reasoning completion
      if (event.type === 'response.output_item.done' && (event as any).item?.type === 'reasoning') {
        console.log('[THINKING] GPT-5 finished reasoning');
        yield { reasoning_complete: true };
      }

      // Look for text delta events
      if (event.type === 'response.output_text.delta' && event.delta) {
        fullResponse += event.delta;
        yield { chunk: event.delta };
      }

      // Handle tool use events (web search)
      if (event.type === 'response.tool_use.start') {
        console.log(`[WEB SEARCH] Starting search: ${event.tool_name || 'web_search'}`);
        // Yield a status message to user
        yield { chunk: '\n\n_[Searching the web...]_\n\n' };
      }

      if (event.type === 'response.tool_use.complete') {
        console.log(`[WEB SEARCH] Search completed: ${event.tool_name || 'web_search'}`);
        // Tool results are automatically incorporated by GPT-5
      }
    }

    const latencyMs = Date.now() - startTime;
    console.log(`[POCKETABLE] Streaming completed (${fullResponse.length} chars) - ${latencyMs}ms${wasCompacted ? ' [COMPACTED]' : ''}`);

    yield { complete: true, compacted: wasCompacted };

  } catch (error) {
    const latencyMs = Date.now() - startTime;
    console.error('[POCKETABLE] Streaming failed:', error);
    yield { error: "I apologize, but I'm having trouble processing your request right now. Please try again." };
  }
}

/**
 * Non-streaming version for backwards compatibility
 */
export async function generatePocketableResponse(
  projectId: string,
  userMessage: string,
  conversationHistory: Array<{ role: string; content: string }>,
  projectFiles: Record<string, string>,
  previousResponseId?: string
): Promise<{ response: string; responseId: string; latencyMs: number; compacted: boolean }> {
  const startTime = Date.now();
  let fullResponse = '';
  let wasCompacted = false;

  try {
    for await (const event of generatePocketableResponseStream(
      projectId,
      userMessage,
      conversationHistory,
      projectFiles,
      previousResponseId
    )) {
      if (event.chunk) {
        fullResponse += event.chunk;
      }
      if (event.compacted !== undefined) {
        wasCompacted = event.compacted;
      }
      if (event.error) {
        fullResponse = event.error;
        break;
      }
    }

    const latencyMs = Date.now() - startTime;
    return {
      response: fullResponse,
      responseId: '',
      latencyMs,
      compacted: wasCompacted,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    console.error('[POCKETABLE] Generation failed:', error);
    return {
      response: "I apologize, but I'm having trouble processing your request right now. Please try again.",
      responseId: '',
      latencyMs,
      compacted: false,
    };
  }
}

/**
 * Complete routing flow: classify + respond if GENERAL
 */
export async function routeMessage(
  projectId: string,
  userMessage: string,
  conversationHistory: Array<{ role: string; content: string }>,
  projectFiles: Record<string, string>,
  previousResponseId?: string
): Promise<RoutingResult> {
  // Step 1: Classify intent WITH conversation context for better accuracy
  const classification = await classifyIntent(userMessage, conversationHistory);

  if (classification.intent === 'BUILD') {
    return {
      intent: 'BUILD',
      confidence: classification.confidence,
      latencyMs: classification.latencyMs,
    };
  }

  // Step 2: Generate Pocketable response for GENERAL
  const pocketable = await generatePocketableResponse(
    projectId,
    userMessage,
    conversationHistory,
    projectFiles,
    previousResponseId
  );

  return {
    intent: 'GENERAL',
    confidence: classification.confidence,
    response: pocketable.response,
    responseId: pocketable.responseId,
    latencyMs: classification.latencyMs + pocketable.latencyMs,
    compacted: pocketable.compacted,
  };
}
