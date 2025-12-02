const { Daytona } = require('@daytonaio/sdk');

async function testSandbox() {
  const daytona = new Daytona({
    apiKey: 'dtn_e380cebb7e0a8fcc8c74e9646c006987c744457729be645918398d2679c6efea',
    apiUrl: 'http://98.91.121.91:3000/api',
    organizationId: '64c5a213-1de4-4e8b-a541-d5e4a1a525ac',
    target: 'us',
  });

  console.log('Testing Daytona SDK...');
  console.log('API URL:', 'http://98.91.121.91:3000/api');
  console.log('Organization ID:', '64c5a213-1de4-4e8b-a541-d5e4a1a525ac');
  console.log('Snapshot:', 'ubuntu-node20');

  try {
    console.log('\nAttempting to create sandbox...');
    const sandbox = await daytona.create({
      public: true,
      snapshot: 'ubuntu-node20',
      ephemeral: true,
    });
    console.log('✅ Sandbox created successfully!');
    console.log('Sandbox ID:', sandbox.id);
    
    // Clean up
    console.log('\nCleaning up...');
    await daytona.stop(sandbox);
    console.log('✅ Sandbox stopped');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Error details:', JSON.stringify(error, null, 2));
  }
}

testSandbox().catch(console.error);
