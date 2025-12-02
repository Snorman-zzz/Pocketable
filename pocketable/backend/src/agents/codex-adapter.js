"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodexAdapter = void 0;
const openai_1 = __importDefault(require("openai"));
const models_1 = require("../config/models");
class CodexAdapter {
    openai;
    conversationHistory = new Map();
    constructor() {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY is not set in environment variables');
        }
        this.openai = new openai_1.default({ apiKey });
    }
    async *chat(prompt, context) {
        try {
            // Get or create conversation history for this project
            const threadId = context.projectId || 'default';
            let messages = this.conversationHistory.get(threadId);
            if (!messages) {
                // Initialize with system message
                messages = [
                    {
                        role: 'system',
                        content: this.buildSystemPrompt(context.mode),
                    },
                ];
                this.conversationHistory.set(threadId, messages);
            }
            // Add conversation history from context if provided
            if (context.conversationHistory && context.conversationHistory.length > 0) {
                // Only add if we don't already have this history
                if (messages.length === 1) {
                    for (const msg of context.conversationHistory) {
                        messages.push({
                            role: msg.role,
                            content: msg.content,
                        });
                    }
                }
            }
            // Add the new user message
            messages.push({
                role: 'user',
                content: prompt,
            });
            // Stream the response using GPT-5
            const stream = await this.openai.chat.completions.create({
                model: 'gpt-5',
                messages,
                stream: true,
                // Note: GPT-5 doesn't support custom temperature or max_tokens
                max_completion_tokens: 4096,
            });
            let fullResponse = '';
            let fullReasoning = '';
            for await (const chunk of stream) {
                // Check for reasoning content (GPT-5's thinking process)
                const reasoning = chunk.choices[0]?.delta?.reasoning_content || '';
                if (reasoning) {
                    fullReasoning += reasoning;
                    yield { type: 'reasoning', text: reasoning };
                }
                // Check for regular content
                const content = chunk.choices[0]?.delta?.content || '';
                if (content) {
                    fullResponse += content;
                    yield { type: 'content', text: content };
                }
            }
            // Add assistant's response to history (include reasoning if present)
            const messageContent = fullReasoning
                ? `<thinking>${fullReasoning}</thinking>\n\n${fullResponse}`
                : fullResponse;
            messages.push({
                role: 'assistant',
                content: messageContent,
            });
            // Keep history manageable (last 20 messages)
            if (messages.length > 21) {
                // Keep system message + last 20 messages
                messages = [messages[0], ...messages.slice(-20)];
                this.conversationHistory.set(threadId, messages);
            }
        }
        catch (error) {
            console.error('OpenAI adapter error:', error);
            throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    buildSystemPrompt(mode) {
        let modeInstructions = '';
        switch (mode) {
            case 'plan':
                modeInstructions = '\n\nCurrent Mode: PLAN MODE - Create a detailed implementation plan before coding. Explain your approach step by step.';
                break;
            case 'build':
                modeInstructions = '\n\nCurrent Mode: BUILD MODE - Generate complete, working React Native code immediately.';
                break;
            case 'auto':
            default:
                modeInstructions = '\n\nCurrent Mode: AUTO MODE - For simple requests, generate code directly. For complex features, explain your plan first.';
                break;
        }
        return models_1.REACT_NATIVE_EXPERT_PROMPT + modeInstructions;
    }
    // Clean up old threads to prevent memory leaks
    clearThread(projectId) {
        this.conversationHistory.delete(projectId);
    }
    clearAllThreads() {
        this.conversationHistory.clear();
    }
}
exports.CodexAdapter = CodexAdapter;
//# sourceMappingURL=codex-adapter.js.map