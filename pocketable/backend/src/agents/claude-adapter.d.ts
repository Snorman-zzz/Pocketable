import type { AgentSDK, ChatContext, ChatChunk } from './types';
export declare class ClaudeAdapter implements AgentSDK {
    private client;
    constructor();
    chat(prompt: string, context: ChatContext): AsyncIterableIterator<ChatChunk>;
    private buildSystemPrompt;
    private buildMessages;
}
//# sourceMappingURL=claude-adapter.d.ts.map