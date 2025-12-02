import { ClaudeAdapter } from './claude-adapter';
import { CodexAdapter } from './codex-adapter';
import type { AgentSDK } from './types';

export type ModelType = 'claude' | 'gpt';

/**
 * Factory for creating the appropriate agent SDK based on model selection
 */
export class AgentFactory {
  private static claudeInstance: ClaudeAdapter | null = null;
  private static codexInstance: CodexAdapter | null = null;

  /**
   * Get an agent instance for the specified model
   * Reuses instances to maintain conversation context
   */
  static getAgent(model: ModelType): AgentSDK {
    switch (model) {
      case 'claude':
        if (!this.claudeInstance) {
          this.claudeInstance = new ClaudeAdapter();
        }
        return this.claudeInstance;

      case 'gpt':
        if (!this.codexInstance) {
          this.codexInstance = new CodexAdapter();
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
  static clearProject(projectId: string) {
    if (this.codexInstance) {
      this.codexInstance.clearThread(projectId);
    }
    // Claude adapter doesn't maintain state, so no cleanup needed
  }
}

/**
 * Convenience function to create an agent
 */
export function createAgent(model: ModelType): AgentSDK {
  return AgentFactory.getAgent(model);
}
