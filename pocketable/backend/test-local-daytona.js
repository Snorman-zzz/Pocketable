const { Daytona } = require('@daytonaio/sdk');

async function test() {
  console.log('🧪 Testing local Daytona sandbox creation...\n');

  const daytona = new Daytona({
    apiKey: 'dtn_952c9db4fa70a78fbb3c01ae47a6ef8868fdd23395b37a726831aecc60bb5a52',
    apiUrl: 'http://localhost:3000/api',
    organizationId: '70c50d84-530d-44de-bbf7-9397cdf8c5ac',
    target: 'us'
  });

  try {
    console.log('📦 Creating sandbox with ubuntu:22.04 snapshot...');

    const sandbox = await daytona.create({
      public: true,
      snapshot: 'ubuntu:22.04',
      ephemeral: true,
    });

    console.log('✅ Sandbox created successfully!');
    console.log('   ID:', sandbox.id);
    console.log('   Container ID:', sandbox.containerId);

    console.log('\n🔍 Testing sandbox functionality...');

    // Test getting root directory
    const rootDir = await sandbox.getUserRootDir();
    console.log('✅ Root directory:', rootDir);

    // Test running a command
    console.log('\n🐚 Running test command: node --version');
    const result = await sandbox.process.executeCommand('node --version || echo "Node not installed"', rootDir);
    console.log('   Output:', result.result?.trim());
    console.log('   Exit code:', result.exitCode);

    // Test checking for daytona daemon
    console.log('\n🔍 Checking for Daytona daemon...');
    const daemonCheck = await sandbox.process.executeCommand('ls -la /usr/local/bin/daytona 2>&1', rootDir);
    console.log('   Result:', daemonCheck.result?.trim());

    console.log('\n🧹 Cleaning up...');
    await daytona.stop(sandbox);
    console.log('✅ Sandbox stopped and removed');

    console.log('\n✨ All tests passed! Local Daytona is working correctly.');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

test();
