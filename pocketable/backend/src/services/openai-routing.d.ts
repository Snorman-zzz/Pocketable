interface RoutingResult {
    intent: 'BUILD' | 'GENERAL';
    confidence: number;
    response?: string;
    responseId?: string;
    latencyMs?: number;
    compacted?: boolean;
}
/**
 * Classify user intent using gpt-5-nano
 */
export declare function classifyIntent(userMessage: string): Promise<{
    intent: 'BUILD' | 'GENERAL';
    confidence: number;
    latencyMs: number;
}>;
/**
 * Generate Pocketable conversational response using gpt-5
 * Returns streaming iterator when stream=true
 */
export declare function generatePocketableResponseStream(projectId: string, userMessage: string, conversationHistory: Array<{
    role: string;
    content: string;
}>, projectFiles: Record<string, string>, previousResponseId?: string): AsyncIterableIterator<{
    chunk?: string;
    complete?: boolean;
    compacted?: boolean;
    error?: string;
}>;
/**
 * Non-streaming version for backwards compatibility
 */
export declare function generatePocketableResponse(projectId: string, userMessage: string, conversationHistory: Array<{
    role: string;
    content: string;
}>, projectFiles: Record<string, string>, previousResponseId?: string): Promise<{
    response: string;
    responseId: string;
    latencyMs: number;
    compacted: boolean;
}>;
/**
 * Complete routing flow: classify + respond if GENERAL
 */
export declare function routeMessage(projectId: string, userMessage: string, conversationHistory: Array<{
    role: string;
    content: string;
}>, projectFiles: Record<string, string>, previousResponseId?: string): Promise<RoutingResult>;
export {};
//# sourceMappingURL=openai-routing.d.ts.map