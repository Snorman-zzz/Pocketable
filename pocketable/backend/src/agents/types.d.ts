export interface ChatContext {
    projectId?: string;
    conversationHistory: Array<{
        role: 'user' | 'assistant' | 'system';
        content: string;
    }>;
    mode: 'auto' | 'plan' | 'build';
    thinkingEnabled?: boolean;
}
export interface ChatChunk {
    type: 'reasoning' | 'content';
    text: string;
}
export interface AgentSDK {
    chat(prompt: string, context: ChatContext): AsyncIterableIterator<ChatChunk>;
    generateCode?(description: string, context: ChatContext): Promise<GeneratedCode>;
}
export interface GeneratedCode {
    files: Record<string, string>;
    description: string;
    snackUrl?: string;
}
export interface StreamChunk {
    type: 'text' | 'code' | 'complete' | 'error';
    content: string;
    metadata?: any;
}
//# sourceMappingURL=types.d.ts.map