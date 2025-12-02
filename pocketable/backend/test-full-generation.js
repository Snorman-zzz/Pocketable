const http = require('http');

const data = JSON.stringify({
  prompt: "Create a simple hello world page with a welcome message",
  projectId: "test-project-001",
  model: "claude"
});

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/generate-daytona',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

console.log('🧪 Testing full generation with extended timeout...\n');

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}\n`);

  let buffer = '';
  let startTime = Date.now();

  res.on('data', (chunk) => {
    buffer += chunk.toString();

    // Process SSE messages
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.substring(6);
        if (data === '[DONE]') {
          console.log('\n✅ Stream completed');
        } else {
          try {
            const message = JSON.parse(data);
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

            if (message.type === 'progress') {
              console.log(`[${elapsed}s] ${message.message}`);
            } else if (message.type === 'error') {
              console.error(`[${elapsed}s] ❌ ERROR: ${message.message}`);
            } else if (message.type === 'complete') {
              console.log(`\n[${elapsed}s] ✅ COMPLETE!`);
              console.log(`   Sandbox: ${message.sandboxId}`);
              console.log(`   Preview: ${message.previewUrl || 'N/A'}`);
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }
  });

  res.on('end', () => {
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n🏁 Request completed in ${totalTime}s`);
    process.exit(0);
  });
});

req.on('error', (error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});

// Extended timeout: 5 minutes
setTimeout(() => {
  console.log('\n⏱️  5 minute timeout reached');
  req.destroy();
  process.exit(0);
}, 300000);

req.write(data);
req.end();
