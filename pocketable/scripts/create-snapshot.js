#!/usr/bin/env node

/**
 * create-snapshot.js
 *
 * Programmatically creates/registers the ubuntu-node20 snapshot with Daytona.
 * Uses the Daytona SDK to avoid manual dashboard access.
 *
 * Usage:
 *   node scripts/create-snapshot.js
 *
 * Prerequisites:
 *   - Docker image ubuntu-node20:latest must exist
 *   - Backend .env must have Daytona credentials
 */

const path = require('path');

// Load dependencies from backend node_modules
const backendPath = path.join(__dirname, '../backend');
const { Daytona, Image } = require(path.join(backendPath, 'node_modules/@daytonaio/sdk'));
const dotenv = require(path.join(backendPath, 'node_modules/dotenv'));
dotenv.config({ path: path.join(backendPath, '.env') });

async function createSnapshot() {
  console.log('================================================');
  console.log('Daytona Snapshot Registration');
  console.log('================================================\n');

  // Validate environment variables
  const requiredEnvVars = [
    'DAYTONA_API_KEY',
    'DAYTONA_API_URL',
    'DAYTONA_ORGANIZATION_ID',
    'DAYTONA_TARGET'
  ];

  const missing = requiredEnvVars.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '));
    console.error('   Please check backend/.env file\n');
    process.exit(1);
  }

  console.log('Daytona Configuration:');
  console.log(`  API URL: ${process.env.DAYTONA_API_URL}`);
  console.log(`  Organization: ${process.env.DAYTONA_ORGANIZATION_ID}`);
  console.log(`  Target: ${process.env.DAYTONA_TARGET}\n`);

  // Initialize Daytona SDK
  const daytona = new Daytona({
    apiKey: process.env.DAYTONA_API_KEY,
    apiUrl: process.env.DAYTONA_API_URL,
    organizationId: process.env.DAYTONA_ORGANIZATION_ID,
    target: process.env.DAYTONA_TARGET,
  });

  console.log('📦 Creating snapshot from Dockerfile...');
  console.log('   Name: ubuntu-node20');
  console.log('   Source: Dockerfile.ubuntu-node20');
  console.log('   Description: Ubuntu 22.04 with Node.js 20 pre-installed\n');

  // Verify Dockerfile exists
  const fs = require('fs');
  const dockerfilePath = path.join(__dirname, '../Dockerfile.ubuntu-node20');

  if (!fs.existsSync(dockerfilePath)) {
    console.error('❌ Error: Dockerfile.ubuntu-node20 not found');
    console.error(`   Expected path: ${dockerfilePath}\n`);
    process.exit(1);
  }

  console.log('Dockerfile found, creating Image object...\n');

  try {
    // Use Image.fromDockerfile() to create proper Image object
    const image = Image.fromDockerfile(dockerfilePath);

    // Create snapshot using Image object
    const snapshot = await daytona.snapshot.create(
      {
        name: 'ubuntu-node20',
        image: image,  // Pass Image object, not string or raw content
      },
      {
        onLogs: (log) => {
          // Stream logs from snapshot creation
          if (log && log.trim()) {
            console.log(`   ${log}`);
          }
        },
        timeout: 0, // No timeout - let it take as long as needed
      }
    );

    console.log('\n================================================');
    console.log('✅ Snapshot created successfully!');
    console.log('================================================\n');
    console.log(`Snapshot ID: ${snapshot.id || 'N/A'}`);
    console.log(`Snapshot Name: ${snapshot.name || 'ubuntu-node20'}`);
    console.log('\nNext steps:');
    console.log('1. Backend is already configured with: DAYTONA_SNAPSHOT_NAME=ubuntu-node20');
    console.log('2. Restart backend to use the new snapshot');
    console.log('3. All new sandboxes will start in ~30 seconds (Node.js pre-installed)\n');

    process.exit(0);
  } catch (error) {
    console.error('\n================================================');
    console.error('❌ Snapshot creation failed');
    console.error('================================================\n');
    console.error('Error:', error.message);

    if (error.response) {
      console.error('API Response:', error.response.data);
    }

    console.error('\nTroubleshooting:');
    console.error('1. Ensure Docker image exists: docker images | grep ubuntu-node20');
    console.error('2. Verify Daytona credentials in backend/.env');
    console.error('3. Check Daytona service is running: curl http://localhost:3000/api/');
    console.error('4. Ensure Docker daemon is accessible\n');

    process.exit(1);
  }
}

// Run the script
createSnapshot();
