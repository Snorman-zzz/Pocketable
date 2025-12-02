import type { AgentSDK, ChatContext, ChatChunk } from './types';
export declare class CodexAdapter implements AgentSDK {
    private openai;
    private conversationHistory;
    constructor();
    chat(prompt: string, context: ChatContext): AsyncIterableIterator<ChatChunk>;
    private buildSystemPrompt;
    clearThread(projectId: string): void;
    clearAllThreads(): void;
}
//# sourceMappingURL=codex-adapter.d.ts.map