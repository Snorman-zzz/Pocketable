import { Daytona } from "@daytonaio/sdk";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables
dotenv.config({ path: path.join(__dirname, "../../.env") });

async function generateAppInDaytona(
  sandboxIdArg?: string,
  prompt?: string
) {
  console.log("🚀 Starting Expo app generation in Daytona sandbox...\n");

  // Debug: Check what env vars we have
  console.log("DEBUG: DAYTONA_API_KEY present?", !!process.env.DAYTONA_API_KEY);
  console.log("DEBUG: ANTHROPIC_API_KEY present?", !!process.env.ANTHROPIC_API_KEY);

  if (!process.env.DAYTONA_API_KEY || !process.env.ANTHROPIC_API_KEY) {
    console.error("ERROR: DAYTONA_API_KEY and ANTHROPIC_API_KEY must be set");
    console.error("Available env vars:", Object.keys(process.env).filter(k => k.includes('API')));
    process.exit(1);
  }

  const daytona = new Daytona({
    apiKey: process.env.DAYTONA_API_KEY,
  });

  let sandbox;
  let sandboxId = sandboxIdArg;

  try {
    // Step 1: Create or get sandbox
    if (sandboxId) {
      console.log(`1. Using existing sandbox: ${sandboxId}`);
      const sandboxes = await daytona.list();
      sandbox = sandboxes.find((s: any) => s.id === sandboxId);
      if (!sandbox) {
        throw new Error(`Sandbox ${sandboxId} not found`);
      }
      console.log(`✓ Connected to sandbox: ${sandbox.id}`);
    } else {
      console.log("1. Creating new Daytona sandbox...");
      sandbox = await daytona.create({
        public: true,
        image: "node:20",
      });
      sandboxId = sandbox.id;
      console.log(`✓ Sandbox created: ${sandboxId}`);
    }

    // Get the root directory
    const rootDir = await sandbox.getUserRootDir();
    console.log(`✓ Working directory: ${rootDir}`);

    // Step 2: Create project directory
    console.log("\n2. Setting up project directory...");
    const projectDir = `${rootDir}/expo-project`;
    await sandbox.process.executeCommand(`mkdir -p ${projectDir}`, rootDir);
    console.log(`✓ Created project directory: ${projectDir}`);

    // Step 3: Initialize npm project
    console.log("\n3. Initializing npm project...");
    await sandbox.process.executeCommand("npm init -y", projectDir);
    console.log("✓ Package.json created");

    // Step 4: Install Claude Code SDK locally in project
    console.log("\n4. Installing Claude Code SDK locally...");
    const installResult = await sandbox.process.executeCommand(
      "npm install @anthropic-ai/claude-code@latest",
      projectDir,
      undefined,
      180000 // 3 minute timeout
    );

    if (installResult.exitCode !== 0) {
      console.error("Installation failed:", installResult.result);
      throw new Error("Failed to install Claude Code SDK");
    }
    console.log("✓ Claude Code SDK installed");

    // Verify installation
    console.log("\n5. Verifying installation...");
    const checkInstall = await sandbox.process.executeCommand(
      "ls -la node_modules/@anthropic-ai/claude-code",
      projectDir
    );
    console.log("Installation check:", checkInstall.result);

    // Step 6: Create the generation script file
    console.log("\n6. Creating generation script file...");

    const generationScript = `const { query } = require('@anthropic-ai/claude-code');
const fs = require('fs');

async function generateExpoApp() {
  const prompt = \`${
    prompt ||
    "Create a simple React Native Expo app with a counter"
  }

  Important requirements:
  - Create an Expo React Native app with TypeScript
  - Use expo-router for navigation (app directory structure)
  - Create all files in the current directory
  - Include a package.json with all necessary dependencies for Expo SDK 54
  - Use NativeWind (Tailwind CSS for React Native) for styling
  - Create at least an index page (app/index.tsx)
  - Make the design modern and responsive
  - Add proper navigation if multiple screens are needed
  \`;

  console.log('Starting Expo app generation with Claude Code...');
  console.log('Working directory:', process.cwd());

  const messages = [];
  const abortController = new AbortController();

  try {
    for await (const message of query({
      prompt: prompt,
      abortController: abortController,
      options: {
        maxTurns: 20,
        allowedTools: [
          'Read',
          'Write',
          'Edit',
          'MultiEdit',
          'Bash',
          'LS',
          'Glob',
          'Grep'
        ]
      }
    })) {
      messages.push(message);

      // Log progress
      if (message.type === 'text') {
        console.log('[Claude]:', (message.text || '').substring(0, 80) + '...');
        console.log('__CLAUDE_MESSAGE__', JSON.stringify({ type: 'assistant', content: message.text }));
      } else if (message.type === 'tool_use') {
        console.log('[Tool]:', message.name, message.input?.file_path || '');
        console.log('__TOOL_USE__', JSON.stringify({
          type: 'tool_use',
          name: message.name,
          input: message.input
        }));
      } else if (message.type === 'result') {
        console.log('__TOOL_RESULT__', JSON.stringify({
          type: 'tool_result',
          result: message.result
        }));
      }
    }

    console.log('\\nGeneration complete!');
    console.log('Total messages:', messages.length);

    // Save generation log
    fs.writeFileSync('generation-log.json', JSON.stringify(messages, null, 2));

    // List generated files
    const files = fs.readdirSync('.').filter(f => !f.startsWith('.'));
    console.log('\\nGenerated files:', files.join(', '));

  } catch (error) {
    console.error('Generation error:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

generateExpoApp().catch(console.error);`;

    // Write the script to a file
    await sandbox.process.executeCommand(
      `cat > generate.js << 'SCRIPT_EOF'
${generationScript}
SCRIPT_EOF`,
      projectDir
    );
    console.log("✓ Generation script written to generate.js");

    // Verify the script was created
    const checkScript = await sandbox.process.executeCommand(
      "ls -la generate.js && head -5 generate.js",
      projectDir
    );
    console.log("Script verification:", checkScript.result);

    // Step 7: Run the generation script
    console.log("\n7. Running Claude Code generation...");
    console.log(`Prompt: "${prompt || "Create a simple Expo counter app"}"`);
    console.log("\nThis may take several minutes...\n");

    const genResult = await sandbox.process.executeCommand(
      "node generate.js",
      projectDir,
      {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        NODE_PATH: `${projectDir}/node_modules`,
      },
      600000 // 10 minute timeout
    );

    console.log("\nGeneration output:");
    console.log(genResult.result);

    if (genResult.exitCode !== 0) {
      throw new Error("Generation failed");
    }

    // Step 8: Check generated files
    console.log("\n8. Checking generated files...");
    const filesResult = await sandbox.process.executeCommand(
      "ls -la",
      projectDir
    );
    console.log(filesResult.result);

    // Step 9: Install dependencies if package.json was created/updated
    const hasPackageJson = await sandbox.process.executeCommand(
      "test -f package.json && echo yes || echo no",
      projectDir
    );

    if (hasPackageJson.result?.trim() === "yes") {
      console.log("\n9. Installing project dependencies...");
      const npmInstall = await sandbox.process.executeCommand(
        "npm install",
        projectDir,
        undefined,
        300000 // 5 minute timeout
      );

      if (npmInstall.exitCode !== 0) {
        console.log("Warning: npm install had issues:", npmInstall.result);
      } else {
        console.log("✓ Dependencies installed");
      }

      // Step 10: Start Expo dev server with web support
      console.log("\n10. Starting Expo development server...");

      // Start the server in background - Expo web for browser preview
      await sandbox.process.executeCommand(
        `nohup npx expo start --web --port 3000 > dev-server.log 2>&1 &`,
        projectDir,
        { PORT: "3000" }
      );

      console.log("✓ Expo server started in background (web mode)");

      // Wait for server to initialize
      console.log("Waiting for server to start...");
      await new Promise((resolve) => setTimeout(resolve, 10000));

      // Check if server is running
      const checkServer = await sandbox.process.executeCommand(
        "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000 || echo 'failed'",
        projectDir
      );

      if (checkServer.result?.trim() === '200') {
        console.log("✓ Server is running!");
      } else {
        console.log("⚠️  Server might still be starting...");
        console.log("You can check logs with: cat dev-server.log");
      }
    }

    // Step 11: Get preview URL
    console.log("\n11. Getting preview URL...");
    const preview = await sandbox.getPreviewLink(3000);

    console.log("\n✨ SUCCESS! Expo app generated!");
    console.log("\n📊 SUMMARY:");
    console.log("===========");
    console.log(`Sandbox ID: ${sandboxId}`);
    console.log(`Project Directory: ${projectDir}`);
    console.log(`Preview URL: ${preview.url}`);
    if (preview.token) {
      console.log(`Access Token: ${preview.token}`);
    }

    console.log("\n🌐 VISIT YOUR APP:");
    console.log(preview.url);

    console.log("\n💡 TIPS:");
    console.log("- The sandbox will stay active for debugging");
    console.log("- Server logs: SSH in and run 'cat expo-project/dev-server.log'");
    console.log(
      `- To get preview URL again: npx tsx scripts/get-preview-url.ts ${sandboxId}`
    );
    console.log(
      `- To reuse this sandbox: npx tsx scripts/generate-in-daytona.ts ${sandboxId}`
    );
    console.log(`- To remove: npx tsx scripts/remove-sandbox.ts ${sandboxId}`);

    return {
      success: true,
      sandboxId: sandboxId,
      projectDir: projectDir,
      previewUrl: preview.url,
    };
  } catch (error: any) {
    console.error("\n❌ ERROR:", error.message);

    if (sandbox) {
      console.log(`\nSandbox ID: ${sandboxId}`);
      console.log("The sandbox is still running for debugging.");

      // Try to get debug info
      try {
        const debugInfo = await sandbox.process.executeCommand(
          "pwd && echo '---' && ls -la && echo '---' && test -f generate.js && cat generate.js | head -20 || echo 'No script'",
          `${await sandbox.getUserRootDir()}/expo-project`
        );
        console.log("\nDebug info:");
        console.log(debugInfo.result);
      } catch (e) {
        // Ignore
      }
    }

    throw error;
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  let sandboxId: string | undefined;
  let prompt: string | undefined;

  // Parse arguments
  if (args.length > 0) {
    // Check if first arg is a sandbox ID (UUID format)
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(args[0])) {
      sandboxId = args[0];
      prompt = args.slice(1).join(" ");
    } else {
      prompt = args.join(" ");
    }
  }

  if (!prompt) {
    prompt =
      "Create a simple counter app with increment and decrement buttons. Use a modern design with NativeWind.";
  }

  console.log("📝 Configuration:");
  console.log(
    `- Sandbox: ${sandboxId ? `Using existing ${sandboxId}` : "Creating new"}`
  );
  console.log(`- Prompt: ${prompt}`);
  console.log();

  try {
    await generateAppInDaytona(sandboxId, prompt);
  } catch (error) {
    console.error("Failed to generate app:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n\n👋 Exiting... The sandbox will continue running.");
  process.exit(0);
});

main();
