#!/usr/bin/env node

const path = require('path');

// Load dependencies from backend node_modules
const backendPath = path.join(__dirname, '../backend');
const { Daytona } = require(path.join(backendPath, 'node_modules/@daytonaio/sdk'));
const dotenv = require(path.join(backendPath, 'node_modules/dotenv'));
dotenv.config({ path: path.join(backendPath, '.env') });

async function deleteSnapshot() {
  const daytona = new Daytona({
    apiKey: process.env.DAYTONA_API_KEY,
    apiUrl: process.env.DAYTONA_API_URL,
    organizationId: process.env.DAYTONA_ORGANIZATION_ID,
    target: process.env.DAYTONA_TARGET,
  });

  try {
    console.log('Deleting errored ubuntu-node20 snapshot...\n');

    // ID from list-snapshots.js output
    const snapshotId = '47987c23-f648-4259-8532-f86aa192862e';

    await daytona.snapshot.delete({ id: snapshotId });

    console.log('✅ Snapshot deleted successfully\n');
  } catch (error) {
    console.error('Error deleting snapshot:', error.message);
    if (error.response) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

deleteSnapshot();
