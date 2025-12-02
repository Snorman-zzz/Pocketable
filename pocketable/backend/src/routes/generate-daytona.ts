import { Router, Request, Response } from 'express';
import { Daytona } from '@daytonaio/sdk';
import { databaseService } from '../services/database';
import { snapshotService } from '../services/snapshot-service';
import { fileService } from '../services/file-service';
import { supabaseIntegrationService } from '../services/supabase-integration';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.post('/', authenticateToken, async (req: Request, res: Response) => {
  console.log('[API] ========= ROUTE HANDLER STARTED =========');
  console.log('[API] Request received at:', new Date().toISOString());

  try {
    const { prompt, projectId, model, sandboxId: existingSandboxId, restoreFromSnapshot, conversationHistory } = req.body;

    console.log('[API] Request body:', { prompt: prompt?.substring(0, 50), projectId, model, existingSandboxId });

    // If restoreFromSnapshot is provided, we're regenerating from a snapshot
    const isRestore = !!restoreFromSnapshot;

    if (!prompt && !isRestore) {
      return res.status(400).json({ error: 'Prompt or restoreFromSnapshot is required' });
    }

    // Verify project ownership (projectId is in body, not params)
    if (projectId) {
      const result = await databaseService.query(
        `SELECT user_id FROM projects WHERE id = $1`,
        [projectId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Project not found' });
      }

      if (result.rows[0].user_id !== req.user!.id) {
        return res.status(403).json({
          error: 'Access denied: You do not own this project',
        });
      }
    }

    if (!process.env.DAYTONA_API_KEY || !process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Missing API keys' });
    }

    console.log('[API] Starting Daytona generation for prompt:', prompt);
    console.log('[API] Project ID:', projectId);
    console.log('[API] Model:', model);
    console.log('[API] Existing Sandbox ID:', existingSandboxId);

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Helper to send SSE message
    const sendSSE = (data: any) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    let sandboxId = '';
    let previewUrl = '';
    let snapshotId: string | null = null;

    // Auto-detect mode: Cloud SDK vs Self-hosted
    const isSelfHosted = !!process.env.DAYTONA_API_URL;
    // For self-hosted: use custom snapshot (with Node.js pre-installed) or fallback to ubuntu:22.04
    // For Cloud SDK: use node:20 image (Node.js pre-installed)
    const sandboxImage = isSelfHosted
      ? (process.env.DAYTONA_SNAPSHOT_NAME || 'ubuntu:22.04')
      : 'node:20';

    console.log(`[API] Daytona mode: ${isSelfHosted ? 'Self-hosted' : 'Cloud SDK'}`);
    console.log(`[API] Sandbox image: ${sandboxImage}`);

    // Debug: Log exact Daytona configuration
    if (isSelfHosted) {
      console.log('[API] Daytona SDK config:', {
        apiKey: process.env.DAYTONA_API_KEY?.substring(0, 10) + '...',
        apiUrl: process.env.DAYTONA_API_URL,
        organizationId: process.env.DAYTONA_ORGANIZATION_ID,
        target: process.env.DAYTONA_TARGET,
      });
    }

    const daytona = isSelfHosted
      ? new Daytona({
          apiKey: process.env.DAYTONA_API_KEY,
          apiUrl: process.env.DAYTONA_API_URL,
          organizationId: process.env.DAYTONA_ORGANIZATION_ID,
          target: process.env.DAYTONA_TARGET,
        })
      : new Daytona({
          apiKey: process.env.DAYTONA_API_KEY,
        });

    try {
      // Step 0: Fetch Supabase credentials if available
      let supabaseEnvVars: Record<string, string> = {};

      if (projectId && databaseService.isAvailable()) {
        try {
          const connection = await supabaseIntegrationService.getConnection(projectId);
          if (connection) {
            supabaseEnvVars = {
              SUPABASE_URL: connection.api_url,
              SUPABASE_ANON_KEY: connection.anon_key,
            };
            console.log('[API] Supabase credentials found for project, will inject as env vars');
          } else {
            console.log('[API] No Supabase connection found for project');
          }
        } catch (error) {
          console.log('[API] Could not fetch Supabase connection:', error);
        }
      }

      // Step 1: Get or create Daytona sandbox
      let sandbox;

      if (existingSandboxId) {
        // Reuse existing sandbox for conversation continuation
        sendSSE({ type: 'progress', message: '🔄 Continuing in existing environment...' });
        try {
          sandbox = await daytona.get(existingSandboxId);
          sandboxId = existingSandboxId;
          sendSSE({ type: 'progress', message: `✓ Using existing environment` });
        } catch (err: any) {
          // Sandbox no longer exists, create a new one
          console.log(`[API] Existing sandbox ${existingSandboxId} not found, creating new one`);
          sendSSE({ type: 'progress', message: '⚠️  Previous environment expired, creating new one...' });

          sandbox = await daytona.create({
            public: true,
            ...(isSelfHosted ? { snapshot: sandboxImage } : { image: sandboxImage }),
            ephemeral: true,
            envVars: supabaseEnvVars,  // Inject Supabase credentials
          });
          sandboxId = sandbox.id;
          sendSSE({ type: 'progress', message: `✓ New environment ready` });
        }
      } else {
        // Create new sandbox for first generation
        sendSSE({ type: 'progress', message: '🚀 Starting website generation...' });
        sendSSE({ type: 'progress', message: '1. Setting up environment...' });

        console.log('[API] Creating sandbox with config:', { snapshot: sandboxImage, ephemeral: true });

        try {
          sandbox = await daytona.create({
            public: true,
            ...(isSelfHosted ? { snapshot: sandboxImage } : { image: sandboxImage }),
            ephemeral: true,           // Delete immediately when stopped (saves disk space)
            envVars: supabaseEnvVars,  // Inject Supabase credentials
          });
          console.log('[API] Sandbox created successfully:', sandbox.id);
        } catch (createError: any) {
          console.error('[API] Sandbox creation failed:', createError.message);
          console.error('[API] Error details:', createError);
          throw createError;
        }

        sandboxId = sandbox.id;
        sendSSE({ type: 'progress', message: `✓ Environment ready` });
      }

      // Get working directory
      const rootDir = await sandbox.getUserRootDir();
      const projectDir = `${rootDir}/website-project`;

      // Create project directory (silently for restore, with messages for new setup)
      if (isRestore) {
        // Restore mode: create directory silently
        await sandbox.process.executeCommand(`mkdir -p ${projectDir}`, rootDir);
      }

      // Only set up project if this is a new sandbox
      if (!existingSandboxId || sandboxId !== existingSandboxId) {
        // Step 1.5: Setup Node.js (check if pre-installed in custom snapshot, install if needed)
        if (isSelfHosted) {
          sendSSE({ type: 'progress', message: '\n1.5. Checking for Node.js...' });

          // First check if Node.js is already installed (e.g., in custom snapshot)
          const checkNode = await sandbox.process.executeCommand(
            'which node && which npm && node --version && npm --version',
            rootDir
          );

          if (checkNode.exitCode === 0) {
            // Node.js already installed (custom snapshot)
            sendSSE({ type: 'progress', message: '✓ Node.js found (pre-installed in snapshot)' });
            sendSSE({ type: 'progress', message: `Node version: ${checkNode.result?.trim()}` });
          } else {
            // Node.js not found, install it (fallback for base ubuntu:22.04)
            sendSSE({ type: 'progress', message: '⚠️  Node.js not found, installing...' });

            // Install and verify in a single command to ensure PATH is updated
            const installNode = await sandbox.process.executeCommand(
              'apt-get update && apt-get install -y curl && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs && node --version && npm --version',
              rootDir,
              undefined,
              300000 // 5 minute timeout for apt update + installations
            );

            if (installNode.exitCode !== 0) {
              // Log detailed error information
              console.error('[API] Node.js installation failed!');
              console.error('[API] Exit code:', installNode.exitCode);
              console.error('[API] Output:', installNode.result);

              // Send error details to client
              sendSSE({ type: 'error', message: 'Node.js installation failed' });
              sendSSE({ type: 'progress', message: `Exit code: ${installNode.exitCode}` });
              sendSSE({ type: 'progress', message: `Error output: ${installNode.result?.substring(0, 500)}` });

              throw new Error(`Failed to install Node.js (exit code ${installNode.exitCode}): ${installNode.result?.substring(0, 200)}`);
            }

            sendSSE({ type: 'progress', message: '✓ Node.js installed and verified' });
            // Extract version info from the output (last few lines)
            const versionInfo = installNode.result?.split('\n').slice(-2).join(', ');
            sendSSE({ type: 'progress', message: `Node version: ${versionInfo}` });
          }
        } else {
          // Cloud SDK: Node.js pre-installed in node:20 image
          sendSSE({ type: 'progress', message: '\n1.5. Using pre-installed Node.js (Cloud SDK mode)...' });
          const checkNode = await sandbox.process.executeCommand(
            'node --version && npm --version',
            rootDir
          );
          sendSSE({ type: 'progress', message: `✓ Node version: ${checkNode.result?.trim()}` });
        }

        // Step 2: Set up project directory
        sendSSE({ type: 'progress', message: '\n2. Setting up project directory...' });
        await sandbox.process.executeCommand(`mkdir -p ${projectDir}`, rootDir);
        sendSSE({ type: 'progress', message: `✓ Created project directory: ${projectDir}` });

        // Step 3: Initialize npm project
        sendSSE({ type: 'progress', message: '\n3. Initializing npm project...' });
        await sandbox.process.executeCommand('npm init -y', projectDir);
        sendSSE({ type: 'progress', message: '✓ Package.json created' });

        // Step 4: Install dependencies
        sendSSE({ type: 'progress', message: '\n4. Installing dependencies...' });
        const installResult = await sandbox.process.executeCommand(
          'npm install @anthropic-ai/claude-code@latest',
          projectDir,
          undefined,
          180000 // 3 minute timeout
        );

        if (installResult.exitCode !== 0) {
          throw new Error('Failed to install dependencies');
        }
        sendSSE({ type: 'progress', message: '✓ Dependencies installed' });

        // Step 5: Verify installation
        sendSSE({ type: 'progress', message: '\n5. Verifying installation...' });
        const checkInstall = await sandbox.process.executeCommand(
          'ls -la node_modules/@anthropic-ai/claude-code',
          projectDir
        );
        sendSSE({ type: 'progress', message: `Installation check: ${checkInstall.result?.substring(0, 100)}...` });
      } else {
        // Reusing existing sandbox - skip setup
        sendSSE({ type: 'progress', message: '\n2. Using existing project directory...' });
        sendSSE({ type: 'progress', message: `✓ Project directory: ${projectDir}` });
      }

      // If restoring from snapshot, load files and skip generation
      if (isRestore && restoreFromSnapshot) {
        sendSSE({ type: 'progress', message: 'Loading your app...' });

        try {
          // Get snapshot
          const snapshot = await snapshotService.getSnapshot(restoreFromSnapshot);

          if (!snapshot) {
            throw new Error('Snapshot not found');
          }

          if (snapshot.project_id !== projectId) {
            throw new Error('Snapshot does not belong to this project');
          }

          // Restore files from snapshot
          const files = snapshot.files;
          const fileCount = Object.keys(files).length;

          let restoredCount = 0;
          for (const [filePath, content] of Object.entries(files)) {
            try {
              // Create directory if needed
              const dir = filePath.substring(0, filePath.lastIndexOf('/'));
              if (dir) {
                await sandbox.process.executeCommand(`mkdir -p ${dir}`, projectDir);
              }

              // Write file (escape special characters properly)
              const escapedContent = content.replace(/'/g, "'\\''");
              await sandbox.process.executeCommand(
                `cat > ${filePath} << 'FILE_EOF'\n${content}\nFILE_EOF`,
                projectDir
              );

              restoredCount++;
            } catch (err) {
              console.error(`Failed to restore file ${filePath}:`, err);
            }
          }

          sendSSE({ type: 'progress', message: 'Starting preview server...' });

          // Kill any existing serve processes
          await sandbox.process.executeCommand(
            'pkill -f "npx serve" || true',
            projectDir
          );

          // Start server in background
          await sandbox.process.executeCommand(
            `nohup npx serve -l 3000 > server.log 2>&1 &`,
            projectDir
          );

          // Poll server with retries
          let serverReady = false;
          const maxRetries = 15;

          for (let i = 0; i < maxRetries; i++) {
            await new Promise(resolve => setTimeout(resolve, 2000));

            const checkServer = await sandbox.process.executeCommand(
              "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000 || echo 'failed'",
              projectDir
            );

            if (checkServer.result?.trim() === '200') {
              serverReady = true;
              break;
            }
          }

          if (!serverReady) {
            throw new Error('Server failed to start after 30 seconds');
          }

          // Get preview URL
          const preview = await sandbox.getPreviewLink(3000);
          previewUrl = preview.url;

          // For self-hosted Daytona: Replace localhost with domain or IP for mobile access
          if (isSelfHosted) {
            try {
              if (process.env.DAYTONA_DOMAIN) {
                // Use custom domain (e.g., daytona.pocketable.dev)
                const protocol = process.env.DAYTONA_PROXY_PROTOCOL || 'http';
                const domain = process.env.DAYTONA_DOMAIN;
                const port = process.env.DAYTONA_PROXY_PORT || '4000';
                // Replace http://proxy.localhost:port with protocol://domain:port
                previewUrl = previewUrl.replace(/http:\/\/([^.]+)\.proxy\.localhost:(\d+)/g, `${protocol}://$1.${domain}${port === '443' || port === '80' ? '' : `:${port}`}`);
                console.log(`[API] Adjusted restore preview URL with domain: ${previewUrl}`);
              } else if (process.env.DAYTONA_API_URL) {
                // Fallback to IP-based URL with nip.io for wildcard DNS
                const apiUrl = new URL(process.env.DAYTONA_API_URL);
                const daytonaHost = apiUrl.hostname;
                // Use nip.io to provide wildcard DNS for IP addresses
                // Example: 3000-sandbox-id.proxy.98.91.121.91.nip.io:4000 resolves to 98.91.121.91
                previewUrl = previewUrl.replace(/\.proxy\.localhost/g, `.proxy.${daytonaHost}.nip.io`);
                console.log(`[API] Adjusted restore preview URL with nip.io: ${previewUrl}`);
              }
            } catch (urlErr) {
              console.error('[API] Failed to adjust restore preview URL:', urlErr);
            }
          }

          sendSSE({ type: 'progress', message: 'Preview ready!' });

          // Send completion
          sendSSE({
            type: 'complete',
            sandboxId,
            previewUrl,
            snapshotId: snapshot.id, // Include snapshot ID so mobile can mark it as active
            restoredFromSnapshot: snapshot.id,
          });

          console.log(`[API] Restore complete. Preview URL: ${previewUrl}`);

          // Schedule sandbox stop
          setTimeout(async () => {
            try {
              console.log(`[API] Stopping ephemeral sandbox: ${sandboxId}`);
              await daytona.stop(sandbox);
              console.log(`[API] ✓ Sandbox stopped: ${sandboxId}`);
            } catch (err: any) {
              console.error(`[API] Failed to stop sandbox ${sandboxId}:`, err.message);
            }
          }, 3600000); // Stop after 1 hour

          // Send done and exit early (skip generation)
          res.write('data: [DONE]\n\n');
          res.end();
          return;

        } catch (restoreErr: any) {
          console.error('[API] Restore error:', restoreErr);
          sendSSE({
            type: 'error',
            message: restoreErr.message || 'Failed to restore from snapshot',
          });

          res.write('data: [DONE]\n\n');
          res.end();
          return;
        }
      }

      // Step 6: Create generation script that runs inside sandbox
      sendSSE({ type: 'progress', message: '\n6. Creating generation script...' });

      // Fetch project knowledge and check for Supabase
      let projectKnowledge = '';

      // Add Supabase configuration instructions if connected
      if (Object.keys(supabaseEnvVars).length > 0) {
        projectKnowledge += `\n\nPROJECT CONFIGURATION:
This project has Supabase connected. Use these environment variables in your code:
- process.env.SUPABASE_URL (available at runtime)
- process.env.SUPABASE_ANON_KEY (available at runtime)

IMPORTANT: These environment variables are already set in the sandbox. Access them using process.env.
Always check if these variables exist before using them. Include fallback behavior for when Supabase is not available.
When creating a Supabase client, use code like this:

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (supabaseUrl && supabaseKey) {
  // Initialize Supabase client
  const supabase = createClient(supabaseUrl, supabaseKey);
} else {
  console.log('Supabase not configured, using mock data or local storage');
  // Implement fallback behavior
}`;
      }

      // Fetch any custom instructions from knowledge field
      if (projectId && databaseService.isAvailable()) {
        try {
          const projectResult = await databaseService.query(
            'SELECT knowledge FROM projects WHERE id = $1',
            [projectId]
          );

          if (projectResult.rows.length > 0 && projectResult.rows[0].knowledge) {
            const knowledge = projectResult.rows[0].knowledge;

            // Add custom instructions if available (but skip supabase credentials)
            if (knowledge.custom) {
              projectKnowledge += `\n\nPROJECT INSTRUCTIONS:
${knowledge.custom}`;
            }
          }
        } catch (error) {
          console.log('Could not fetch project knowledge:', error);
        }
      }

      // Build context-aware prompt if conversation history provided
      let fullPrompt = prompt;

      if (conversationHistory && conversationHistory.length > 0) {
        // Include conversation context (plans, requirements, etc.)
        const contextMessages = conversationHistory
          .map((m: any) => `${m.role.toUpperCase()}: ${m.content}`)
          .join('\n\n');

        fullPrompt = `You are implementing a plan that was discussed in a previous conversation. Read the CONVERSATION CONTEXT carefully to understand what needs to be built.

CONVERSATION CONTEXT:
${contextMessages}

CURRENT REQUEST: ${prompt}

IMPORTANT: The user is asking you to implement the plan that was discussed in the conversation above. DO NOT create a generic website. Instead, build exactly what was described in the conversation context. Follow ALL requirements, architecture decisions, and features that were outlined in the discussion above.`;
      }

      // Prepend project knowledge to the prompt (before conversation context)
      if (projectKnowledge) {
        fullPrompt = projectKnowledge + '\n\n' + fullPrompt;
      }

      fullPrompt += `

Important requirements:
- Create a modern responsive website with HTML, CSS, and JavaScript
- Use modern CSS (flexbox, grid, animations)
- Create all files in the current directory
- Include an index.html as the main entry point
- Make the design beautiful and professional
- Add interactivity with JavaScript where appropriate
- Use semantic HTML5 elements`;

      const generationScript = `const { query } = require('@anthropic-ai/claude-code');

async function generateWebsite() {
  const prompt = \`${fullPrompt.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`;

  console.log('Starting website generation...');
  console.log('Working directory:', process.cwd());

  const abortController = new AbortController();

  try {
    for await (const message of query({
      prompt: prompt,
      abortController: abortController,
      options: {
        maxTurns: 20,
        allowedTools: ['Read', 'Write', 'Edit', 'MultiEdit', 'Bash', 'LS', 'Glob', 'Grep']
      }
    })) {
      if (message.type === 'text') {
        console.log('__CLAUDE_MESSAGE__', JSON.stringify({ content: message.text }));
      } else if (message.type === 'tool_use') {
        console.log('__TOOL_USE__', JSON.stringify({ name: message.name, input: message.input }));
      }
    }
    console.log('\\nGeneration complete!');
  } catch (error) {
    console.error('Generation error:', error);
    process.exit(1);
  }
}

generateWebsite().catch(console.error);`;

      // Write the script file
      await sandbox.process.executeCommand(
        `cat > generate.js << 'SCRIPT_EOF'\n${generationScript}\nSCRIPT_EOF`,
        projectDir
      );
      sendSSE({ type: 'progress', message: '✓ Generation script created' });

      // Step 7: Run the generation script
      sendSSE({ type: 'progress', message: '\n7. Generating your app...' });
      // Show the full context-aware prompt (truncated for readability)
      const promptPreview = fullPrompt.length > 200
        ? fullPrompt.substring(0, 200) + '...'
        : fullPrompt;
      sendSSE({ type: 'progress', message: `Prompt: "${promptPreview}"` });
      sendSSE({ type: 'progress', message: '\nThis may take several minutes...\n' });

      // Start keep-alive heartbeat to prevent SSE timeout
      const keepAliveInterval = setInterval(() => {
        sendSSE({ type: 'heartbeat', message: '⏳ Still generating...' });
      }, 15000); // Send heartbeat every 15 seconds

      try {
        // Execute generation directly with 10-minute timeout (like Cloud SDK)
        const genProcess = sandbox.process.executeCommand(
          'node generate.js',
          projectDir,
          {
            ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
            NODE_PATH: `${projectDir}/node_modules`,
          },
          600000 // 10 minute timeout - matches old project configuration
        );

        console.log(`[API] Started generation with direct execution (10min timeout)`);
        sendSSE({ type: 'progress', message: '✓ Generation started' });

        // Await completion
        const genResult = await genProcess;

        // Stop keep-alive heartbeat
        clearInterval(keepAliveInterval);

        // Check if generation succeeded
        if (genResult.exitCode !== 0) {
          console.error('[API] Generation failed with exit code:', genResult.exitCode);
          console.error('[API] Output:', genResult.result?.substring(0, 500));
          throw new Error(`Generation failed with exit code ${genResult.exitCode}`);
        }

        console.log(`[API] Generation completed successfully`);
        sendSSE({ type: 'progress', message: `✓ Generation completed` });

        // Parse output for Claude messages and tool uses
        if (genResult.result) {
          const lines = genResult.result.split('\n');
          for (const line of lines) {
            if (line.includes('__CLAUDE_MESSAGE__')) {
              const jsonStart = line.indexOf('__CLAUDE_MESSAGE__') + '__CLAUDE_MESSAGE__'.length;
              try {
                const msg = JSON.parse(line.substring(jsonStart).trim());
                sendSSE({ type: 'claude_message', content: msg.content });
              } catch (e) {
                // Ignore parse errors
              }
            } else if (line.includes('__TOOL_USE__')) {
              const jsonStart = line.indexOf('__TOOL_USE__') + '__TOOL_USE__'.length;
              try {
                const tool = JSON.parse(line.substring(jsonStart).trim());
                sendSSE({ type: 'tool_use', name: tool.name, input: tool.input });
                const fileName = tool.input?.file_path || tool.input?.path || '';
                sendSSE({ type: 'progress', message: `[Tool]: ${tool.name} ${fileName}` });
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
        }
      } catch (genError) {
        // Stop keep-alive on error
        clearInterval(keepAliveInterval);
        throw genError;
      }

      sendSSE({ type: 'progress', message: '\n✓ Generation complete!' });

      // Step 7: Check generated files
      sendSSE({ type: 'progress', message: '\n7. Checking generated files...' });
      const filesResult = await sandbox.process.executeCommand('ls -la', projectDir);
      const files = filesResult.result?.split('\n').filter(line => line.includes('.html') || line.includes('.css') || line.includes('.js'));
      sendSSE({ type: 'progress', message: `✓ Generated files: ${files?.length || 0} files` });

      // Step 8: Start and verify HTTP server
      sendSSE({ type: 'progress', message: '\n8. Starting HTTP server...' });

      // Kill any existing serve processes
      await sandbox.process.executeCommand(
        'pkill -f "npx serve" || true',
        projectDir
      );

      // Start server in background
      await sandbox.process.executeCommand(
        `nohup npx serve -l 3000 > server.log 2>&1 &`,
        projectDir
      );
      sendSSE({ type: 'progress', message: '✓ Server started in background' });

      // Poll server with retries until it responds
      sendSSE({ type: 'progress', message: 'Waiting for server to initialize...' });
      let serverReady = false;
      const maxRetries = 15; // 15 attempts = ~30 seconds

      for (let i = 0; i < maxRetries; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds between checks

        const checkServer = await sandbox.process.executeCommand(
          "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000 || echo 'failed'",
          projectDir
        );

        if (checkServer.result?.trim() === '200') {
          serverReady = true;
          sendSSE({ type: 'progress', message: '✓ Server is running and responding!' });
          break;
        }

        // Send progress update every few attempts
        if ((i + 1) % 3 === 0) {
          sendSSE({ type: 'progress', message: `Still waiting for server... (${i + 1}/${maxRetries})` });
        }
      }

      if (!serverReady) {
        throw new Error('Server failed to start after 30 seconds. Check server.log for errors.');
      }

      // Step 9: Get preview URL
      sendSSE({ type: 'progress', message: '\n9. Getting preview URL...' });
      const preview = await sandbox.getPreviewLink(3000);
      previewUrl = preview.url;

      // For self-hosted Daytona: Replace localhost with domain or IP for mobile access
      if (isSelfHosted) {
        try {
          if (process.env.DAYTONA_DOMAIN) {
            // Use custom domain (e.g., daytona.pocketable.dev)
            const protocol = process.env.DAYTONA_PROXY_PROTOCOL || 'http';
            const domain = process.env.DAYTONA_DOMAIN;
            const port = process.env.DAYTONA_PROXY_PORT || '4000';
            // Replace http://proxy.localhost:port with protocol://domain:port
            previewUrl = previewUrl.replace(/http:\/\/([^.]+)\.proxy\.localhost:(\d+)/g, `${protocol}://$1.${domain}${port === '443' || port === '80' ? '' : `:${port}`}`);
            console.log(`[API] Adjusted preview URL with domain: ${previewUrl}`);
          } else if (process.env.DAYTONA_API_URL) {
            // Fallback to IP-based URL with nip.io for wildcard DNS
            const apiUrl = new URL(process.env.DAYTONA_API_URL);
            const daytonaHost = apiUrl.hostname;
            // Use nip.io to provide wildcard DNS for IP addresses
            // Example: 3000-sandbox-id.proxy.98.91.121.91.nip.io:4000 resolves to 98.91.121.91
            previewUrl = previewUrl.replace(/\.proxy\.localhost/g, `.proxy.${daytonaHost}.nip.io`);
            console.log(`[API] Adjusted preview URL with nip.io: ${previewUrl}`);
          }
        } catch (urlErr) {
          console.error('[API] Failed to adjust preview URL:', urlErr);
        }
      }

      // Step 10: Save generated files to database (if projectId provided)
      if (projectId) {
        sendSSE({ type: 'progress', message: '\n10. Saving files to database...' });

        try {
          // Get list of generated files (excluding node_modules, etc.)
          const listFilesResult = await sandbox.process.executeCommand(
            'find . -type f -not -path "*/node_modules/*" -not -path "*/.git/*" -not -name "*.log" -not -name "generate.js" -not -name "package*.json"',
            projectDir
          );

          const filePaths = listFilesResult.result?.split('\n')
            .filter(line => line.trim())
            .map(line => line.replace('./', '')) || [];

          sendSSE({ type: 'progress', message: `Found ${filePaths.length} files to save` });

          // Read and save each file
          let savedCount = 0;
          for (const filePath of filePaths) {
            try {
              const fileContent = await sandbox.process.executeCommand(
                `cat ${filePath}`,
                projectDir
              );

              if (fileContent.result) {
                await fileService.saveFile(projectId, filePath, fileContent.result);
                savedCount++;
              }
            } catch (err) {
              console.error(`Failed to save file ${filePath}:`, err);
            }
          }

          sendSSE({ type: 'progress', message: `✓ Saved ${savedCount} files to database` });
          console.log(`[API] Saved ${savedCount} files for project ${projectId}`);

          // Create snapshot after successful build
          try {
            sendSSE({ type: 'progress', message: 'Creating version snapshot...' });

            // Create assistant message in database first
            const isFirstGeneration = !existingSandboxId;
            const messageContent = isFirstGeneration
              ? 'Preview ready! Your app has been generated and is ready to view'
              : 'Preview ready! Your changes have been applied';

            const msgResult = await databaseService.query(
              `INSERT INTO chat_messages (project_id, role, content, model, is_edit_card)
               VALUES ($1, 'assistant', $2, $3, true)
               RETURNING id`,
              [projectId, messageContent, model || 'claude']
            );

            const messageId = msgResult.rows[0].id;
            console.log(`[API] Created assistant message: ${messageId}`);

            // Build files object from saved files
            const filesObject: Record<string, string> = {};
            for (const filePath of filePaths) {
              try {
                const fileContent = await sandbox.process.executeCommand(
                  `cat ${filePath}`,
                  projectDir
                );
                if (fileContent.result) {
                  filesObject[filePath] = fileContent.result;
                }
              } catch (err) {
                console.error(`Failed to read file ${filePath} for snapshot:`, err);
              }
            }

            // Create snapshot linked to the message
            const snapshot = await snapshotService.createSnapshot(
              projectId,
              messageId,
              filesObject,
              sandboxId,
              previewUrl
            );

            snapshotId = snapshot.id;

            // Mark message as edit card and link to snapshot
            await snapshotService.markMessageAsEditCard(messageId, snapshot.id);

            // Update project's current snapshot
            await snapshotService.updateProjectCurrentSnapshot(projectId, snapshot.id);

            sendSSE({ type: 'progress', message: `✓ Snapshot created: ${snapshot.id}` });
            console.log(`[API] Snapshot created for project ${projectId}: ${snapshot.id}`);
          } catch (snapshotErr: any) {
            console.error('[API] Failed to create snapshot:', snapshotErr);
            sendSSE({ type: 'progress', message: `⚠️  Warning: Could not create snapshot: ${snapshotErr.message}` });
          }
        } catch (err: any) {
          console.error('[API] Failed to save files to database:', err);
          sendSSE({ type: 'progress', message: `⚠️  Warning: Could not save files to database: ${err.message}` });
        }
      }

      sendSSE({ type: 'progress', message: '\n✨ SUCCESS! Website generated!' });
      sendSSE({ type: 'progress', message: '\n📊 Your app is ready to view' });

      // Mark first build as completed if this is the first successful build
      if (projectId) {
        try {
          await databaseService.query(
            `UPDATE projects
             SET first_build_completed = TRUE,
                 first_build_at = CASE
                   WHEN first_build_at IS NULL THEN NOW()
                   ELSE first_build_at
                 END
             WHERE id = $1 AND first_build_completed = FALSE`,
            [projectId]
          );
          console.log(`[API] Marked first build completed for project ${projectId}`);
        } catch (err) {
          console.error('[API] Failed to mark first build completed:', err);
        }
      }

      // Send completion
      sendSSE({
        type: 'complete',
        sandboxId,
        previewUrl,
        snapshotId, // Include snapshot ID so mobile app can mark message as edit card
      });

      console.log(`[API] Generation complete. Preview URL: ${previewUrl}`);

      // Stop the sandbox after a delay to allow preview to be accessed
      // Since ephemeral=true, stopping will trigger automatic deletion
      setTimeout(async () => {
        try {
          console.log(`[API] Stopping ephemeral sandbox: ${sandboxId}`);
          await daytona.stop(sandbox);
          console.log(`[API] ✓ Sandbox stopped and will be auto-deleted: ${sandboxId}`);
        } catch (err: any) {
          console.error(`[API] Failed to stop sandbox ${sandboxId}:`, err.message);
        }
      }, 3600000); // Stop after 1 hour to allow extended preview access

    } catch (error: any) {
      console.error('[API] Generation error:', error);
      sendSSE({
        type: 'error',
        message: error.message || 'Generation failed',
      });

      // Clean up sandbox on error
      if (sandboxId) {
        try {
          console.log(`[API] Cleaning up sandbox after error: ${sandboxId}`);
          const errorSandbox = await daytona.get(sandboxId);
          await daytona.stop(errorSandbox);
          console.log(`[API] ✓ Error sandbox stopped: ${sandboxId}`);
        } catch (cleanupErr: any) {
          console.error(`[API] Failed to cleanup sandbox ${sandboxId}:`, cleanupErr.message);
        }
      }
    }

    // Send done signal and close
    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error: any) {
    console.error('[API] Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  }
});

export default router;
