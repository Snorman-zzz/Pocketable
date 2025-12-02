const fetch = require('node-fetch');

async function testSupabaseInjection() {
  try {
    console.log('Testing Supabase credential injection...\n');

    // Test request to generate-daytona endpoint
    const response = await fetch('http://localhost:3001/api/generate-daytona', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        projectId: '1b9e9e5a-65f5-4281-a787-b2421d9d24eb', // Quora clone project with test credentials
        message: 'Create a simple hello world app with Supabase integration',
        model: 'claude',
        mode: 'build',
        streamId: 'test-stream-' + Date.now(),
        knowledge: ''
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Error response:', error);
      return;
    }

    // Read the streaming response
    const reader = response.body;
    const decoder = new TextDecoder();

    console.log('Streaming response from backend:\n');

    for await (const chunk of reader) {
      const text = decoder.decode(chunk, { stream: true });
      // Parse SSE events
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'token') {
              process.stdout.write(data.content);
            } else if (data.type === 'daytona_url') {
              console.log('\n\nDaytona URL:', data.url);
            } else if (data.type === 'error') {
              console.error('\nError:', data.error);
            } else if (data.type === 'debug') {
              console.log('\nDebug:', data.message);
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }

  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testSupabaseInjection();