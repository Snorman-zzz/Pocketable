const { Daytona } = require('@daytonaio/sdk');

async function testNodeAvailability() {
  const daytona = new Daytona({
    apiKey: 'dtn_e380cebb7e0a8fcc8c74e9646c006987c744457729be645918398d2679c6efea',
    apiUrl: 'http://98.91.121.91:3000/api',
    organizationId: '64c5a213-1de4-4e8b-a541-d5e4a1a525ac',
    target: 'us',
  });

  console.log('🚀 Creating sandbox with custom ubuntu-node20 snapshot...\n');

  const startTime = Date.now();

  try {
    // Create non-ephemeral sandbox so it doesn't get auto-deleted
    const sandbox = await daytona.create({
      public: true,
      snapshot: 'ubuntu-node20',
      ephemeral: false,  // Keep it alive for testing
    });

    const createTime = Date.now() - startTime;
    console.log(`✅ Sandbox created in ${createTime}ms`);
    console.log(`   Sandbox ID: ${sandbox.id}\n`);

    // Wait a moment for daemon to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test Node.js availability
    console.log('🔍 Testing Node.js availability...');
    const nodeCheckStart = Date.now();

    const nodeVersion = await sandbox.process.exec('node --version');
    const npmVersion = await sandbox.process.exec('npm --version');

    const nodeCheckTime = Date.now() - nodeCheckStart;

    console.log(`✅ Node.js is IMMEDIATELY available (${nodeCheckTime}ms)!`);
    console.log(`   Node.js version: ${nodeVersion.stdout.trim()}`);
    console.log(`   npm version: ${npmVersion.stdout.trim()}\n`);

    const totalTime = Date.now() - startTime;
    console.log(`⚡ Total time: ${totalTime}ms (~${Math.round(totalTime/1000)}s)`);
    console.log(`🎉 SUCCESS: No 2-3 minute Node.js installation delay!\n`);

    // Clean up
    console.log('🧹 Cleaning up...');
    await daytona.stop(sandbox);
    console.log('✅ Sandbox stopped');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('   Response:', error.response.data);
    }
  }
}

testNodeAvailability().catch(console.error);
