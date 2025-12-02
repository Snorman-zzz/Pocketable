import type { AgentSDK } from './types';
export type ModelType = 'claude' | 'gpt';
/**
 * Factory for creating the appropriate agent SDK based on model selection
 */
export declare class AgentFactory {
    private static claudeInstance;
    private static codexInstance;
    /**
     * Get an agent instance for the specified model
     * Reuses instances to maintain conversation context
     */
    static getAgent(model: ModelType): AgentSDK;
    /**
     * Reset all agent instances (useful for testing or cleanup)
     */
    static reset(): void;
    /**
     * Clear conversation history for a specific project
     */
    static clearProject(projectId: string): void;
}
/**
 * Convenience function to create an agent
 */
export declare function createAgent(model: ModelType): AgentSDK;
//# sourceMappingURL=agent-factory.d.ts.map