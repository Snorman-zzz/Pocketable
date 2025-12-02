"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const sdk_1 = require("@daytonaio/sdk");
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
// Load environment variables
dotenv.config({ path: path.join(__dirname, "../../.env") });
async function getPreviewUrl(sandboxId, port = 3000) {
    if (!process.env.DAYTONA_API_KEY) {
        console.error("ERROR: DAYTONA_API_KEY must be set");
        process.exit(1);
    }
    const daytona = new sdk_1.Daytona({
        apiKey: process.env.DAYTONA_API_KEY,
    });
    try {
        // Get sandbox
        const sandboxes = await daytona.list();
        const sandbox = sandboxes.find((s) => s.id === sandboxId);
        if (!sandbox) {
            throw new Error(`Sandbox ${sandboxId} not found`);
        }
        console.log(`✓ Found sandbox: ${sandboxId}`);
        // Get preview URL
        const preview = await sandbox.getPreviewLink(port);
        console.log("\n🌐 Preview URL:");
        console.log(preview.url);
        if (preview.token) {
            console.log(`\n🔑 Access Token: ${preview.token}`);
        }
        return preview.url;
    }
    catch (error) {
        console.error("Failed to get preview URL:", error.message);
        process.exit(1);
    }
}
// Main execution
async function main() {
    const sandboxId = process.argv[2];
    const port = process.argv[3] ? parseInt(process.argv[3]) : 3000;
    if (!sandboxId) {
        console.error("Usage: npx tsx scripts/get-preview-url.ts <sandbox-id> [port]");
        console.error("Example: npx tsx scripts/get-preview-url.ts 7a517a82-942c-486b-8a62-6357773eb3ea 3000");
        process.exit(1);
    }
    await getPreviewUrl(sandboxId, port);
}
main();
//# sourceMappingURL=get-preview-url.js.map