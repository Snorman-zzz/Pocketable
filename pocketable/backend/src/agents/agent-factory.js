"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentFactory = void 0;
exports.createAgent = createAgent;
const claude_adapter_1 = require("./claude-adapter");
const codex_adapter_1 = require("./codex-adapter");
/**
 * Factory for creating the appropriate agent SDK based on model selection
 */
class AgentFactory {
    static claudeInstance = null;
    static codexInstance = null;
    /**
     * Get an agent instance for the specified model
     * Reuses instances to maintain conversation context
     */
    static getAgent(model) {
        switch (model) {
            case 'claude':
                if (!this.claudeInstance) {
                    this.claudeInstance = new claude_adapter_1.ClaudeAdapter();
                }
                return this.claudeInstance;
            case 'gpt':
                if (!this.codexInstance) {
                    this.codexInstance = new codex_adapter_1.CodexAdapter();
                }
                return this.codexInstance;
            default:
                throw new Error(`Unknown model type: ${model}`);
        }
    }
    /**
     * Reset all agent instances (useful for testing or cleanup)
     */
    static reset() {
        this.claudeInstance = null;
        if (this.codexInstance) {
            this.codexInstance.clearAllThreads();
        }
        this.codexInstance = null;
    }
    /**
     * Clear conversation history for a specific project
     */
    static clearProject(projectId) {
        if (this.codexInstance) {
            this.codexInstance.clearThread(projectId);
        }
        // Claude adapter doesn't maintain state, so no cleanup needed
    }
}
exports.AgentFactory = AgentFactory;
/**
 * Convenience function to create an agent
 */
function createAgent(model) {
    return AgentFactory.getAgent(model);
}
//# sourceMappingURL=agent-factory.js.map