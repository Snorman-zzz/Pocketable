import OpenAI from 'openai';
import { databaseService } from './database';

interface Suggestion {
  summary: string;  // 2-3 word summary for the tab
  fullText: string; // Complete suggestion text for the input
}

interface SuggestionsContext {
  projectId: string;
  conversationHistory: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  projectFiles: Record<string, string>;
  hasSupabase: boolean;
}

// Singleton OpenAI client for suggestions
let suggestionsClient: OpenAI | null = null;

function getSuggestionsClient(): OpenAI {
  if (!suggestionsClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }
    suggestionsClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    console.log('✅ Suggestions agent initialized with GPT-5');
  }
  return suggestionsClient;
}

/**
 * Generate smart BUILD suggestions using GPT-5
 * Analyzes conversation history and codebase to suggest next steps
 */
export async function generateSmartSuggestions(
  context: SuggestionsContext
): Promise<Suggestion[]> {
  const startTime = Date.now();
  const client = getSuggestionsClient();

  try {
    // Build context for GPT-5
    const contextParts: string[] = [];

    // Add conversation history (last 10 messages for efficiency)
    if (context.conversationHistory.length > 0) {
      contextParts.push('## Recent Conversation:');
      const recentHistory = context.conversationHistory.slice(-10);
      for (const msg of recentHistory) {
        const roleLabel = msg.role.toUpperCase();
        // Truncate long messages for context efficiency
        const content = msg.content.length > 500
          ? msg.content.substring(0, 500) + '...'
          : msg.content;
        contextParts.push(`${roleLabel}: ${content}`);
      }
    }

    // Add project files summary (file names and brief content)
    if (Object.keys(context.projectFiles).length > 0) {
      contextParts.push('\n## Current Project Files:');
      for (const [filePath, content] of Object.entries(context.projectFiles)) {
        // Just show file structure and first few lines
        const preview = content.split('\n').slice(0, 5).join('\n');
        contextParts.push(`### ${filePath}\n${preview}\n...`);
      }
    }

    const fullContext = contextParts.join('\n');

    // Create prompt for GPT-5
    const prompt = `You are a smart suggestions agent for Pocketable, a mobile app builder.
Analyze the conversation history, current project state, and backend capabilities to generate BUILD action suggestions.

${fullContext}

## Project Backend Status:
- Supabase Connected: ${context.hasSupabase ? 'YES' : 'NO'}
${context.hasSupabase ? `
This project has Supabase backend integration available, which means:
- Data should be persisted to the Supabase database (NOT localStorage)
- User authentication and accounts are available
- Real-time data sync across devices is possible
- API endpoints can interact with the database
- File uploads can use Supabase Storage
` : `
This project does NOT have backend integration yet, which means:
- Data persistence should use localStorage or AsyncStorage
- No user authentication available yet
- Data is device-specific (no sync)
- Consider suggesting "Connect Supabase" as a future enhancement
`}

Based on this context, generate 3-5 smart BUILD suggestions for what the user should do next.

Each suggestion should be:
1. Action-oriented (starts with a verb)
2. Specific to their current project
3. Logical next steps based on what they've already built
4. Appropriate for the backend capabilities available

${context.hasSupabase ? `
For Supabase-connected projects, prioritize suggestions like:
- "Save to database" or "Store in Supabase" (NOT localStorage)
- "Add user authentication" or "Implement user accounts"
- "Create API endpoint" for database operations
- "Sync data across devices"
- "Add real-time updates"
- "Implement user profiles"
- "Store files in Supabase Storage"
` : `
For projects without backend, suggest:
- Local storage solutions (localStorage, AsyncStorage)
- "Connect Supabase" for advanced features
- Client-side only features
- Offline-first functionality
`}

Return suggestions in this exact JSON format:
{
  "suggestions": [
    {
      "summary": "Add navigation",
      "fullText": "Add a navigation menu to switch between screens"
    },
    {
      "summary": "Style header",
      "fullText": "Style the header with gradient background and custom fonts"
    },
    {
      "summary": "${context.hasSupabase ? 'Save to database' : 'Save locally'}",
      "fullText": "${context.hasSupabase ?
        'Save new items to Supabase database for persistence' :
        'Save new items to localStorage for persistence'}"
    }
  ]
}

Important:
- Summary must be 2-3 words maximum
- Full text should be a complete, actionable sentence
- Focus on BUILD actions only (no questions or general queries)
- Suggestions should build upon existing work
- Storage suggestions MUST match backend capabilities
- If discussing data persistence, use "Supabase database" when connected, "localStorage" when not`;

    // Call GPT-5 with automatic reasoning adjustment
    const response = await client.responses.create({
      model: 'gpt-5',
      input: prompt,
      text: { verbosity: 'low' }, // We want concise JSON output
      // Not setting reasoning.effort - let GPT-5 decide based on task complexity
    });

    const latencyMs = Date.now() - startTime;
    console.log(`[SUGGESTIONS] Generated suggestions in ${latencyMs}ms`);

    // Parse the response
    const outputText = response.output_text || '';

    try {
      // Extract JSON from the response
      const jsonMatch = outputText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const result = JSON.parse(jsonMatch[0]);

      if (result.suggestions && Array.isArray(result.suggestions)) {
        // Validate and clean suggestions
        const validSuggestions = result.suggestions
          .filter((s: any) => s.summary && s.fullText)
          .slice(0, 5) // Maximum 5 suggestions
          .map((s: any) => ({
            summary: s.summary.substring(0, 20), // Ensure summary isn't too long
            fullText: s.fullText,
          }));

        console.log(`[SUGGESTIONS] Returning ${validSuggestions.length} suggestions`);
        return validSuggestions;
      }
    } catch (parseError) {
      console.error('[SUGGESTIONS] Failed to parse GPT-5 response:', parseError);
      console.error('[SUGGESTIONS] Raw output:', outputText);
    }

    // Return empty array if parsing fails
    return [];

  } catch (error) {
    const latencyMs = Date.now() - startTime;
    console.error(`[SUGGESTIONS] Generation failed after ${latencyMs}ms:`, error);

    // Return empty array on error
    return [];
  }
}

/**
 * Cache suggestions to avoid redundant API calls
 * Key: projectId + conversation hash
 * TTL: 5 minutes
 */
const suggestionsCache = new Map<string, {
  suggestions: Suggestion[];
  timestamp: number;
}>();

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getCachedSuggestions(
  context: SuggestionsContext
): Promise<Suggestion[]> {
  // Create cache key from project ID, last message, and Supabase status
  const lastMessage = context.conversationHistory[context.conversationHistory.length - 1];
  const cacheKey = `${context.projectId}_${context.hasSupabase ? 'supabase' : 'local'}_${lastMessage?.content.substring(0, 50) || 'empty'}`;

  // Check cache
  const cached = suggestionsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('[SUGGESTIONS] Returning cached suggestions');
    return cached.suggestions;
  }

  // Generate new suggestions
  const suggestions = await generateSmartSuggestions(context);

  // Update cache
  suggestionsCache.set(cacheKey, {
    suggestions,
    timestamp: Date.now(),
  });

  // Clean old cache entries
  for (const [key, value] of suggestionsCache.entries()) {
    if (Date.now() - value.timestamp > CACHE_TTL) {
      suggestionsCache.delete(key);
    }
  }

  return suggestions;
}