/**
 * Daytona Auto-Start Utility
 *
 * Automatically starts the self-hosted Daytona instance via Lambda if it's stopped.
 * This provides transparent auto-start without requiring manual intervention.
 */

interface AutoStartResponse {
  status: 'ready' | 'starting' | 'transitioning';
  message: string;
  daytona_api_url?: string;
  backend_url?: string;
  wait_seconds?: number;
  instance_state?: string;
}

const MAX_RETRIES = 10;
const INITIAL_WAIT_MS = 5000;

/**
 * Checks if Daytona is reachable
 */
async function isDaytonaReachable(apiUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(apiUrl, {
      signal: controller.signal,
      method: 'GET',
    });

    clearTimeout(timeout);
    return response.ok || response.status === 200;
  } catch (error) {
    return false;
  }
}

/**
 * Calls the Lambda auto-start endpoint
 */
async function callAutoStart(autoStartUrl: string): Promise<AutoStartResponse> {
  const response = await fetch(autoStartUrl, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Auto-start failed: HTTP ${response.status}`);
  }

  return await response.json();
}

/**
 * Waits for Daytona to become ready
 */
async function waitForReady(
  autoStartUrl: string,
  apiUrl: string,
  maxRetries: number = MAX_RETRIES
): Promise<void> {
  console.log('⏳ Waiting for Daytona to become ready...');

  for (let i = 0; i < maxRetries; i++) {
    // Check if Daytona is reachable
    if (await isDaytonaReachable(apiUrl)) {
      console.log('✅ Daytona is ready!');
      return;
    }

    // Call auto-start to check status
    try {
      const response = await callAutoStart(autoStartUrl);

      if (response.status === 'ready') {
        console.log('✅ Daytona is ready!');
        return;
      }

      const waitSeconds = response.wait_seconds || 10;
      console.log(`⏳ Daytona is ${response.status}. Waiting ${waitSeconds}s... (${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
    } catch (error) {
      console.error('❌ Auto-start check failed:', error);
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }

  throw new Error('Daytona failed to start after maximum retries');
}

/**
 * Ensures Daytona is running and ready.
 * If stopped, automatically starts it via Lambda and waits for it to be ready.
 *
 * @param apiUrl - Daytona API URL
 * @param autoStartUrl - Lambda auto-start endpoint URL
 */
export async function ensureDaytonaRunning(
  apiUrl: string,
  autoStartUrl: string | undefined
): Promise<void> {
  // If no auto-start URL, assume always-on or local mode
  if (!autoStartUrl) {
    return;
  }

  console.log('🔍 Checking if Daytona is reachable...');

  // Check if Daytona is already reachable
  if (await isDaytonaReachable(apiUrl)) {
    console.log('✅ Daytona is already running');
    return;
  }

  console.log('🚀 Daytona is not reachable. Triggering auto-start...');

  // Call auto-start endpoint
  const response = await callAutoStart(autoStartUrl);

  if (response.status === 'ready') {
    console.log('✅ Daytona is ready!');
    return;
  }

  // Wait for services to be ready
  await waitForReady(autoStartUrl, apiUrl);
}
