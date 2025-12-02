import Anthropic from '@anthropic-ai/sdk';
import { POCKETABLE_PROMPT } from '../config/pocketable-prompt';
import type { AgentSDK, ChatContext, ChatChunk } from './types';

export class ClaudeAdapter implements AgentSDK {
  private client: Anthropic;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY || '';
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not set in environment variables');
    }
    this.client = new Anthropic({ apiKey });
  }

  async *chat(prompt: string, context: ChatContext): AsyncIterableIterator<ChatChunk> {
    try {
      // Build the system prompt and messages
      const systemPrompt = this.buildSystemPrompt(context.mode, context.thinkingEnabled);
      const messages = this.buildMessages(prompt, context);

      console.log('🔧 Claude adapter - creating stream with', messages.length, 'messages');
      console.log('📋 System prompt length:', systemPrompt.length, 'characters');
      console.log('📋 Mode instructions preview:', systemPrompt.substring(systemPrompt.lastIndexOf('Current Mode:')));

      // Create streaming request
      const stream = await this.client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 8000,
        system: systemPrompt,
        messages,
        stream: true,
      });

      // Track state for parsing <thinking> tags
      let inThinking = false;
      let buffer = '';

      // Stream the response
      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            const text = event.delta.text;
            buffer += text;

            // Process buffer to detect <thinking> tags
            while (buffer.length > 0) {
              if (!inThinking) {
                // Check for opening <thinking> tag
                const thinkingStart = buffer.indexOf('<thinking>');
                if (thinkingStart !== -1) {
                  // Yield content before <thinking> tag
                  if (thinkingStart > 0) {
                    yield { type: 'content', text: buffer.substring(0, thinkingStart) };
                  }
                  buffer = buffer.substring(thinkingStart + '<thinking>'.length);
                  inThinking = true;
                } else {
                  // No thinking tag found, yield all as content
                  // But keep last 10 chars in buffer in case tag is split
                  if (buffer.length > 10) {
                    const toYield = buffer.substring(0, buffer.length - 10);
                    yield { type: 'content', text: toYield };
                    buffer = buffer.substring(buffer.length - 10);
                  }
                  break;
                }
              } else {
                // We're inside <thinking> tag, look for closing tag
                const thinkingEnd = buffer.indexOf('</thinking>');
                if (thinkingEnd !== -1) {
                  // Yield thinking content
                  if (thinkingEnd > 0) {
                    yield { type: 'reasoning', text: buffer.substring(0, thinkingEnd) };
                  }
                  buffer = buffer.substring(thinkingEnd + '</thinking>'.length);
                  inThinking = false;
                } else {
                  // No closing tag yet, yield as reasoning but keep last 11 chars
                  if (buffer.length > 11) {
                    const toYield = buffer.substring(0, buffer.length - 11);
                    yield { type: 'reasoning', text: toYield };
                    buffer = buffer.substring(buffer.length - 11);
                  }
                  break;
                }
              }
            }
          }
        }
      }

      // Yield any remaining buffer
      if (buffer.length > 0) {
        yield { type: inThinking ? 'reasoning' : 'content', text: buffer };
      }
    } catch (error) {
      console.error('Claude adapter error:', error);
      throw new Error(`Claude API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private buildSystemPrompt(mode: 'auto' | 'plan' | 'build', thinkingEnabled?: boolean): string {
    let modeInstructions = '';

    switch (mode) {
      case 'plan':
        modeInstructions = '\n\nCurrent Mode: PLAN MODE - Analyze the request and create a detailed implementation plan. Present the plan inside <plan>...</plan> tags. Do not implement code yet. Wait for user approval.';
        break;
      case 'build':
        modeInstructions = '\n\nCurrent Mode: BUILD MODE - Directly implement the requested changes. Generate complete, working code. Make the changes immediately without asking for permission.';
        break;
      case 'auto':
      default:
        modeInstructions = '\n\nCurrent Mode: AUTO MODE - For app building requests (like "build an app", "create a calculator", etc.), IMMEDIATELY generate complete, working code using the structured action tags or code block format described above. Do not present a plan first - just build it. Use the <pocketableAction> tags for real-time file creation. For minor changes or refactors, make the changes directly. Only present a plan if explicitly asked to plan.';
        break;
    }

    let thinkingInstructions = '';
    if (thinkingEnabled) {
      thinkingInstructions = '\n\nIMPORTANT: Show your reasoning process before your final response. Wrap your reasoning inside <thinking>...</thinking> tags. In the thinking section, explain your thought process, analyze the problem, consider different approaches, and plan your response. After the thinking section, provide your actual response without the thinking tags.';
    }

    return POCKETABLE_PROMPT + modeInstructions + thinkingInstructions;
  }

  private buildMessages(prompt: string, context: ChatContext): Array<{ role: 'user' | 'assistant'; content: string }> {
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    // Add conversation history if available
    if (context.conversationHistory && context.conversationHistory.length > 0) {
      context.conversationHistory.slice(-5).forEach((msg) => {
        messages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content,
        });
      });
    }

    // Add current prompt (with project context if available)
    let currentPrompt = prompt;
    if (context.projectId) {
      currentPrompt = `[Project ID: ${context.projectId}]\n\n${prompt}`;
    }

    messages.push({
      role: 'user',
      content: currentPrompt,
    });

    return messages;
  }
}
