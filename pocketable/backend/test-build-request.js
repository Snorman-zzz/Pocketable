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

console.log('🧪 Testing build request to backend...\n');
console.log('Request:', {
  url: `http://${options.hostname}:${options.port}${options.path}`,
  body: JSON.parse(data)
});
console.log('\n📡 Sending request...\n');

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log(`Headers:`, res.headers);
  console.log('\n📨 Response stream:\n');

  let buffer = '';

  res.on('data', (chunk) => {
    buffer += chunk.toString();

    // Process SSE messages
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.substring(6);
        if (data === '[DONE]') {
          console.log('\n✅ Stream completed');
        } else {
          try {
            const message = JSON.parse(data);
            if (message.type === 'progress') {
              console.log(`  [PROGRESS] ${message.message}`);
            } else if (message.type === 'error') {
              console.error(`  [ERROR] ${message.message}`);
            } else if (message.type === 'complete') {
              console.log(`  [COMPLETE] Sandbox: ${message.sandboxId}`);
              console.log(`  [COMPLETE] Preview: ${message.previewUrl}`);
            }
          } catch (e) {
            console.log('  ', line);
          }
        }
      }
    }
  });

  res.on('end', () => {
    console.log('\n🏁 Request completed');
    process.exit(0);
  });
});

req.on('error', (error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});

// Timeout after 30 seconds
setTimeout(() => {
  console.log('\n⏱️  30 second timeout - closing connection');
  req.destroy();
  process.exit(0);
}, 30000);

req.write(data);
req.end();
