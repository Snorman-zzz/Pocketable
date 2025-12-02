"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const sdk_1 = require("@daytonaio/sdk");
const database_1 = require("../services/database");
const snapshot_service_1 = require("../services/snapshot-service");
const file_service_1 = require("../services/file-service");
const router = (0, express_1.Router)();
router.post('/', async (req, res) => {
    try {
        const { prompt, projectId, model, sandboxId: existingSandboxId, restoreFromSnapshot } = req.body;
        // If restoreFromSnapshot is provided, we're regenerating from a snapshot
        const isRestore = !!restoreFromSnapshot;
        if (!prompt && !isRestore) {
            return res.status(400).json({ error: 'Prompt or restoreFromSnapshot is required' });
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
        const sendSSE = (data) => {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        };
        let sandboxId = '';
        let previewUrl = '';
        let snapshotId = null;
        // Auto-detect mode: Cloud SDK vs Self-hosted
        const isSelfHosted = !!process.env.DAYTONA_API_URL;
        const sandboxImage = isSelfHosted ? 'ubuntu:22.04' : 'node:20';
        console.log(`[API] Daytona mode: ${isSelfHosted ? 'Self-hosted' : 'Cloud SDK'}`);
        console.log(`[API] Sandbox image: ${sandboxImage}`);
        const daytona = isSelfHosted
            ? new sdk_1.Daytona({
                apiKey: process.env.DAYTONA_API_KEY,
                apiUrl: process.env.DAYTONA_API_URL,
                organizationId: process.env.DAYTONA_ORGANIZATION_ID,
                target: process.env.DAYTONA_TARGET,
            })
            : new sdk_1.Daytona({
                apiKey: process.env.DAYTONA_API_KEY,
            });
        try {
            // Step 1: Get or create Daytona sandbox
            let sandbox;
            if (existingSandboxId) {
                // Reuse existing sandbox for conversation continuation
                sendSSE({ type: 'progress', message: '🔄 Continuing in existing environment...' });
                try {
                    sandbox = await daytona.get(existingSandboxId);
                    sandboxId = existingSandboxId;
                    sendSSE({ type: 'progress', message: `✓ Using existing environment` });
                }
                catch (err) {
                    // Sandbox no longer exists, create a new one
                    console.log(`[API] Existing sandbox ${existingSandboxId} not found, creating new one`);
                    sendSSE({ type: 'progress', message: '⚠️  Previous environment expired, creating new one...' });
                    sandbox = await daytona.create({
                        public: true,
                        ...(isSelfHosted ? { snapshot: sandboxImage } : { image: sandboxImage }),
                        ephemeral: true,
                    });
                    sandboxId = sandbox.id;
                    sendSSE({ type: 'progress', message: `✓ New environment ready` });
                }
            }
            else {
                // Create new sandbox for first generation
                sendSSE({ type: 'progress', message: '🚀 Starting website generation...' });
                sendSSE({ type: 'progress', message: '1. Setting up environment...' });
                sandbox = await daytona.create({
                    public: true,
                    ...(isSelfHosted ? { snapshot: sandboxImage } : { image: sandboxImage }),
                    ephemeral: true, // Delete immediately when stopped (saves disk space)
                });
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
            // Only set up project if this is a new sandbox AND not restoring
            if (!isRestore && (!existingSandboxId || sandboxId !== existingSandboxId)) {
                // Step 1.5: Install Node.js 20 (only for self-hosted Ubuntu snapshot)
                if (isSelfHosted) {
                    sendSSE({ type: 'progress', message: '\n1.5. Installing Node.js 20 (self-hosted mode)...' });
                    const installNode = await sandbox.process.executeCommand('apt-get update && apt-get install -y curl && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs', rootDir, undefined, 300000 // 5 minute timeout for apt update + installations
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
                    sendSSE({ type: 'progress', message: '✓ Node.js installed' });
                    // Verify Node installation
                    const checkNode = await sandbox.process.executeCommand('which node && which npm && node --version && npm --version', rootDir);
                    if (checkNode.exitCode !== 0) {
                        sendSSE({ type: 'error', message: 'Node.js verification failed' });
                        throw new Error('Node.js or npm not found in PATH');
                    }
                    sendSSE({ type: 'progress', message: `Node version: ${checkNode.result?.trim()}` });
                }
                else {
                    sendSSE({ type: 'progress', message: '\n1.5. Using pre-installed Node.js (Cloud SDK mode)...' });
                    const checkNode = await sandbox.process.executeCommand('node --version && npm --version', rootDir);
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
                // Step 4: Install Claude Code SDK
                sendSSE({ type: 'progress', message: '\n4. Installing Claude Code SDK locally...' });
                const installResult = await sandbox.process.executeCommand('npm install @anthropic-ai/claude-code@latest', projectDir, undefined, 180000 // 3 minute timeout
                );
                if (installResult.exitCode !== 0) {
                    throw new Error('Failed to install Claude Code SDK');
                }
                sendSSE({ type: 'progress', message: '✓ Claude Code SDK installed' });
                // Step 5: Verify installation
                sendSSE({ type: 'progress', message: '\n5. Verifying installation...' });
                const checkInstall = await sandbox.process.executeCommand('ls -la node_modules/@anthropic-ai/claude-code', projectDir);
                sendSSE({ type: 'progress', message: `Installation check: ${checkInstall.result?.substring(0, 100)}...` });
            }
            else {
                // Reusing existing sandbox - skip setup
                sendSSE({ type: 'progress', message: '\n2. Using existing project directory...' });
                sendSSE({ type: 'progress', message: `✓ Project directory: ${projectDir}` });
            }
            // If restoring from snapshot, load files and skip generation
            if (isRestore && restoreFromSnapshot) {
                sendSSE({ type: 'progress', message: 'Loading your app...' });
                try {
                    // Get snapshot
                    const snapshot = await snapshot_service_1.snapshotService.getSnapshot(restoreFromSnapshot);
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
                            await sandbox.process.executeCommand(`cat > ${filePath} << 'FILE_EOF'\n${content}\nFILE_EOF`, projectDir);
                            restoredCount++;
                        }
                        catch (err) {
                            console.error(`Failed to restore file ${filePath}:`, err);
                        }
                    }
                    sendSSE({ type: 'progress', message: 'Starting preview server...' });
                    // Kill any existing serve processes
                    await sandbox.process.executeCommand('pkill -f "npx serve" || true', projectDir);
                    // Start server in background
                    await sandbox.process.executeCommand(`nohup npx serve -l 3000 > server.log 2>&1 &`, projectDir);
                    // Poll server with retries
                    let serverReady = false;
                    const maxRetries = 15;
                    for (let i = 0; i < maxRetries; i++) {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        const checkServer = await sandbox.process.executeCommand("curl -s -o /dev/null -w '%{http_code}' http://localhost:3000 || echo 'failed'", projectDir);
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
                        }
                        catch (err) {
                            console.error(`[API] Failed to stop sandbox ${sandboxId}:`, err.message);
                        }
                    }, 3600000); // Stop after 1 hour
                    // Send done and exit early (skip generation)
                    res.write('data: [DONE]\n\n');
                    res.end();
                    return;
                }
                catch (restoreErr) {
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
            // Step 6: Create generation script that runs Claude Code inside sandbox
            sendSSE({ type: 'progress', message: '\n6. Creating generation script...' });
            const fullPrompt = `${prompt}

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

  console.log('Starting website generation with Claude Code...');
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
            await sandbox.process.executeCommand(`cat > generate.js << 'SCRIPT_EOF'\n${generationScript}\nSCRIPT_EOF`, projectDir);
            sendSSE({ type: 'progress', message: '✓ Generation script created' });
            // Step 7: Run the generation script
            sendSSE({ type: 'progress', message: '\n7. Running Claude Code generation...' });
            sendSSE({ type: 'progress', message: `Prompt: "${prompt}"` });
            sendSSE({ type: 'progress', message: '\nThis may take several minutes...\n' });
            // Start keep-alive heartbeat to prevent SSE timeout
            const keepAliveInterval = setInterval(() => {
                sendSSE({ type: 'heartbeat', message: '⏳ Still generating...' });
            }, 15000); // Send heartbeat every 15 seconds
            try {
                // Run script and stream output
                const genProcess = sandbox.process.executeCommand('node generate.js', projectDir, {
                    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
                    NODE_PATH: `${projectDir}/node_modules`,
                }, 600000 // 10 minute timeout
                );
                // Note: executeCommand waits for completion, so we can't stream in real-time
                // For now, wait for completion
                const genResult = await genProcess;
                if (genResult.result) {
                    const lines = genResult.result.split('\n');
                    for (const line of lines) {
                        if (line.includes('__CLAUDE_MESSAGE__')) {
                            const jsonStart = line.indexOf('__CLAUDE_MESSAGE__') + '__CLAUDE_MESSAGE__'.length;
                            try {
                                const msg = JSON.parse(line.substring(jsonStart).trim());
                                sendSSE({ type: 'claude_message', content: msg.content });
                            }
                            catch (e) { }
                        }
                        else if (line.includes('__TOOL_USE__')) {
                            const jsonStart = line.indexOf('__TOOL_USE__') + '__TOOL_USE__'.length;
                            try {
                                const tool = JSON.parse(line.substring(jsonStart).trim());
                                sendSSE({ type: 'tool_use', name: tool.name, input: tool.input });
                                const fileName = tool.input?.file_path || tool.input?.path || '';
                                sendSSE({ type: 'progress', message: `[Tool]: ${tool.name} ${fileName}` });
                            }
                            catch (e) { }
                        }
                    }
                }
                // Stop keep-alive heartbeat
                clearInterval(keepAliveInterval);
                if (genResult.exitCode !== 0) {
                    throw new Error('Generation failed');
                }
            }
            catch (genError) {
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
            await sandbox.process.executeCommand('pkill -f "npx serve" || true', projectDir);
            // Start server in background
            await sandbox.process.executeCommand(`nohup npx serve -l 3000 > server.log 2>&1 &`, projectDir);
            sendSSE({ type: 'progress', message: '✓ Server started in background' });
            // Poll server with retries until it responds
            sendSSE({ type: 'progress', message: 'Waiting for server to initialize...' });
            let serverReady = false;
            const maxRetries = 15; // 15 attempts = ~30 seconds
            for (let i = 0; i < maxRetries; i++) {
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds between checks
                const checkServer = await sandbox.process.executeCommand("curl -s -o /dev/null -w '%{http_code}' http://localhost:3000 || echo 'failed'", projectDir);
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
            // Step 10: Save generated files to database (if projectId provided)
            if (projectId) {
                sendSSE({ type: 'progress', message: '\n10. Saving files to database...' });
                try {
                    // Get list of generated files (excluding node_modules, etc.)
                    const listFilesResult = await sandbox.process.executeCommand('find . -type f -not -path "*/node_modules/*" -not -path "*/.git/*" -not -name "*.log" -not -name "generate.js" -not -name "package*.json"', projectDir);
                    const filePaths = listFilesResult.result?.split('\n')
                        .filter(line => line.trim())
                        .map(line => line.replace('./', '')) || [];
                    sendSSE({ type: 'progress', message: `Found ${filePaths.length} files to save` });
                    // Read and save each file
                    let savedCount = 0;
                    for (const filePath of filePaths) {
                        try {
                            const fileContent = await sandbox.process.executeCommand(`cat ${filePath}`, projectDir);
                            if (fileContent.result) {
                                await file_service_1.fileService.saveFile(projectId, filePath, fileContent.result);
                                savedCount++;
                            }
                        }
                        catch (err) {
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
                        const msgResult = await database_1.databaseService.query(`INSERT INTO chat_messages (project_id, role, content, model, is_edit_card)
               VALUES ($1, 'assistant', $2, $3, true)
               RETURNING id`, [projectId, messageContent, model || 'claude']);
                        const messageId = msgResult.rows[0].id;
                        console.log(`[API] Created assistant message: ${messageId}`);
                        // Build files object from saved files
                        const filesObject = {};
                        for (const filePath of filePaths) {
                            try {
                                const fileContent = await sandbox.process.executeCommand(`cat ${filePath}`, projectDir);
                                if (fileContent.result) {
                                    filesObject[filePath] = fileContent.result;
                                }
                            }
                            catch (err) {
                                console.error(`Failed to read file ${filePath} for snapshot:`, err);
                            }
                        }
                        // Create snapshot linked to the message
                        const snapshot = await snapshot_service_1.snapshotService.createSnapshot(projectId, messageId, filesObject, sandboxId, previewUrl);
                        snapshotId = snapshot.id;
                        // Mark message as edit card and link to snapshot
                        await snapshot_service_1.snapshotService.markMessageAsEditCard(messageId, snapshot.id);
                        // Update project's current snapshot
                        await snapshot_service_1.snapshotService.updateProjectCurrentSnapshot(projectId, snapshot.id);
                        sendSSE({ type: 'progress', message: `✓ Snapshot created: ${snapshot.id}` });
                        console.log(`[API] Snapshot created for project ${projectId}: ${snapshot.id}`);
                    }
                    catch (snapshotErr) {
                        console.error('[API] Failed to create snapshot:', snapshotErr);
                        sendSSE({ type: 'progress', message: `⚠️  Warning: Could not create snapshot: ${snapshotErr.message}` });
                    }
                }
                catch (err) {
                    console.error('[API] Failed to save files to database:', err);
                    sendSSE({ type: 'progress', message: `⚠️  Warning: Could not save files to database: ${err.message}` });
                }
            }
            sendSSE({ type: 'progress', message: '\n✨ SUCCESS! Website generated!' });
            sendSSE({ type: 'progress', message: '\n📊 Your app is ready to view' });
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
                }
                catch (err) {
                    console.error(`[API] Failed to stop sandbox ${sandboxId}:`, err.message);
                }
            }, 3600000); // Stop after 1 hour to allow extended preview access
        }
        catch (error) {
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
                }
                catch (cleanupErr) {
                    console.error(`[API] Failed to cleanup sandbox ${sandboxId}:`, cleanupErr.message);
                }
            }
        }
        // Send done signal and close
        res.write('data: [DONE]\n\n');
        res.end();
    }
    catch (error) {
        console.error('[API] Error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message || 'Internal server error' });
        }
    }
});
exports.default = router;
//# sourceMappingURL=generate-daytona.js.map