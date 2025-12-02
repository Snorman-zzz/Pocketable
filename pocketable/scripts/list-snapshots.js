#!/usr/bin/env node

const path = require('path');

// Load dependencies from backend node_modules
const backendPath = path.join(__dirname, '../backend');
const { Daytona } = require(path.join(backendPath, 'node_modules/@daytonaio/sdk'));
const dotenv = require(path.join(backendPath, 'node_modules/dotenv'));
dotenv.config({ path: path.join(backendPath, '.env') });

async function listSnapshots() {
  const daytona = new Daytona({
    apiKey: process.env.DAYTONA_API_KEY,
    apiUrl: process.env.DAYTONA_API_URL,
    organizationId: process.env.DAYTONA_ORGANIZATION_ID,
    target: process.env.DAYTONA_TARGET,
  });

  try {
    console.log('Fetching snapshots...\n');
    const result = await daytona.snapshot.list();

    console.log('Raw result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error listing snapshots:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

listSnapshots();
