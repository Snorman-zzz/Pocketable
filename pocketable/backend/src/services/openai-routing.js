"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyIntent = classifyIntent;
exports.generatePocketableResponseStream = generatePocketableResponseStream;
exports.generatePocketableResponse = generatePocketableResponse;
exports.routeMessage = routeMessage;
const openai_1 = __importDefault(require("openai"));
const database_1 = require("./database");
// System prompts
const ROUTER_PROMPT = `You are a strict router. Classify USER_MESSAGE as BUILD or GENERAL.

BUILD criteria (any match = BUILD):
- Keywords: create, build, make, modify, change, update, fix, adjust, tweak, add, remove, delete, refactor, implement, run, regenerate, debug, test
- Patterns: "make X [verb]", "change X to Y", "update the X", "now add", "also include"
- References: code, files, packages, preview, sandbox, errors, dev tooling, UI elements (button, background, color, layout, screen, component)
- Iterative requests: modifications to existing features (e.g., "make the background pink" implies existing UI)
- Project context: references to "the app", "the game", "the project", "this feature"

GENERAL criteria:
- Greetings: hi, hello, hey, thanks
- Meta questions: what is Pocketable, how does X work, help, documentation
- Non-coding discussion: personal questions, unrelated topics

Examples:
- "Make the background pink" → BUILD (modify + UI element)
- "Change the color to blue" → BUILD (change + style)
- "Build a tic tac toe game" → BUILD (create + app)
- "Now add a reset button" → BUILD (add + continuation)
- "Fix the layout" → BUILD (fix + UI)
- "What is Pocketable?" → GENERAL (meta question)
- "Hello" → GENERAL (greeting)
- "Thanks" → GENERAL (gratitude)

Return JSON: { "intent": "BUILD" | "GENERAL", "confidence": number }.`;
const POCKETABLE_PROMPT = `You are Pocketable, a helpful mobile app builder assistant.
Be concise and friendly. Use project context and past conversation.
Never write or modify code; for code changes, the user should issue a BUILD request.`;
// Singleton OpenAI client
let openaiClient = null;
function getOpenAIClient() {
    if (!openaiClient) {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY not configured');
        }
        openaiClient = new openai_1.default({
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
function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
/**
 * Calculate total context tokens
 */
function calculateContextSize(conversationHistory, projectFiles) {
    // History tokens
    const historyTokens = conversationHistory.reduce((sum, msg) => sum + estimateTokens(msg.content), 0);
    // Files tokens (truncated)
    const filesTokens = Object.values(projectFiles).reduce((sum, content) => sum + estimateTokens(content.substring(0, 3000)), 0);
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
async function compactConversationIfNeeded(projectId, conversationHistory, projectFiles) {
    const currentTokens = calculateContextSize(conversationHistory, projectFiles);
    const capacityUsed = currentTokens / MAX_CONTEXT_TOKENS;
    console.log(`[CONTEXT] Using ${currentTokens} tokens (${(capacityUsed * 100).toFixed(1)}% capacity)`);
    // Check if compaction needed (95% threshold like Claude Code)
    if (capacityUsed < COMPACTION_THRESHOLD) {
        return conversationHistory; // No compaction needed
    }
    console.log(`[COMPACT] Auto-compacting conversation at ${(capacityUsed * 100).toFixed(1)}% capacity`);
    // Check if already compacted (has system message with summary)
    const hasExistingSummary = conversationHistory.some(msg => msg.role === 'system' && msg.content.includes('Previous conversation summary:'));
    if (hasExistingSummary) {
        // Already compacted once - keep summary + last 5 messages
        const summaryMsg = conversationHistory.find(msg => msg.role === 'system' && msg.content.includes('Previous conversation summary:'));
        const recentMessages = conversationHistory.slice(-5);
        console.log(`[COMPACT] Already compacted, keeping summary + last 5 messages`);
        return [summaryMsg, ...recentMessages];
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
            model: 'gpt-5-nano',
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
        await database_1.databaseService.query(`INSERT INTO chat_messages (project_id, role, content, model)
       VALUES ($1, 'system', $2, 'gpt-5-nano')`, [projectId, `Previous conversation summary:\n${summary}`]);
        // Return: summary + recent messages
        return [
            { role: 'system', content: `Previous conversation summary:\n${summary}` },
            ...recentMessages,
        ];
    }
    catch (error) {
        console.error('[COMPACT] Compaction failed:', error);
        // Fallback: just keep last 10 messages
        console.log('[COMPACT] Fallback: keeping last 10 messages');
        return conversationHistory.slice(-10);
    }
}
/**
 * Classify user intent using gpt-5-nano
 */
async function classifyIntent(userMessage) {
    const startTime = Date.now();
    const client = getOpenAIClient();
    try {
        const response = await client.responses.create({
            model: 'gpt-5-nano',
            input: `${ROUTER_PROMPT}\n\nUSER_MESSAGE: ${userMessage}`,
            reasoning: { effort: 'minimal' },
            text: { verbosity: 'low' },
        });
        const latencyMs = Date.now() - startTime;
        const outputText = response.output_text || '';
        try {
            const result = JSON.parse(outputText);
            if (result.intent && result.confidence !== undefined) {
                console.log(`[ROUTING] ${result.intent} (${result.confidence.toFixed(2)}) - ${latencyMs}ms`);
                return {
                    intent: result.intent,
                    confidence: result.confidence,
                    latencyMs,
                };
            }
        }
        catch (parseError) {
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
    }
    catch (error) {
        const latencyMs = Date.now() - startTime;
        console.error('[ROUTING] Classification failed:', error);
        return { intent: 'BUILD', confidence: 0.0, latencyMs };
    }
}
/**
 * Generate Pocketable conversational response using gpt-5
 * Returns streaming iterator when stream=true
 */
async function* generatePocketableResponseStream(projectId, userMessage, conversationHistory, projectFiles, previousResponseId) {
    const startTime = Date.now();
    const client = getOpenAIClient();
    try {
        // Auto-compact if needed (Claude Code approach)
        const compactedHistory = await compactConversationIfNeeded(projectId, conversationHistory, projectFiles);
        const wasCompacted = compactedHistory.length !== conversationHistory.length;
        // Build context
        const contextParts = [POCKETABLE_PROMPT];
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
        const requestParams = {
            model: 'gpt-5',
            input: fullInput,
            reasoning: { effort: 'low' },
            text: { verbosity: 'medium' },
            stream: true, // Enable streaming
        };
        if (previousResponseId) {
            requestParams.previous_response_id = previousResponseId;
        }
        const stream = await client.responses.create(requestParams);
        let fullResponse = '';
        // Stream chunks - OpenAI uses event-based streaming
        for await (const event of stream) {
            // Look for text delta events
            if (event.type === 'response.output_text.delta' && event.delta) {
                fullResponse += event.delta;
                yield { chunk: event.delta };
            }
        }
        const latencyMs = Date.now() - startTime;
        console.log(`[POCKETABLE] Streaming completed (${fullResponse.length} chars) - ${latencyMs}ms${wasCompacted ? ' [COMPACTED]' : ''}`);
        yield { complete: true, compacted: wasCompacted };
    }
    catch (error) {
        const latencyMs = Date.now() - startTime;
        console.error('[POCKETABLE] Streaming failed:', error);
        yield { error: "I apologize, but I'm having trouble processing your request right now. Please try again." };
    }
}
/**
 * Non-streaming version for backwards compatibility
 */
async function generatePocketableResponse(projectId, userMessage, conversationHistory, projectFiles, previousResponseId) {
    const startTime = Date.now();
    let fullResponse = '';
    let wasCompacted = false;
    try {
        for await (const event of generatePocketableResponseStream(projectId, userMessage, conversationHistory, projectFiles, previousResponseId)) {
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
    }
    catch (error) {
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
async function routeMessage(projectId, userMessage, conversationHistory, projectFiles, previousResponseId) {
    // Step 1: Classify intent
    const classification = await classifyIntent(userMessage);
    if (classification.intent === 'BUILD') {
        return {
            intent: 'BUILD',
            confidence: classification.confidence,
            latencyMs: classification.latencyMs,
        };
    }
    // Step 2: Generate Pocketable response for GENERAL
    const pocketable = await generatePocketableResponse(projectId, userMessage, conversationHistory, projectFiles, previousResponseId);
    return {
        intent: 'GENERAL',
        confidence: classification.confidence,
        response: pocketable.response,
        responseId: pocketable.responseId,
        latencyMs: classification.latencyMs + pocketable.latencyMs,
        compacted: pocketable.compacted,
    };
}
//# sourceMappingURL=openai-routing.js.map