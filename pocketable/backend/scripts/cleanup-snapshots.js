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
dotenv.config({ path: path.join(__dirname, "../.env") });
async function cleanupAllSnapshots() {
    if (!process.env.DAYTONA_API_KEY) {
        console.error("ERROR: DAYTONA_API_KEY must be set");
        process.exit(1);
    }
    const daytona = new sdk_1.Daytona({
        apiKey: process.env.DAYTONA_API_KEY,
    });
    try {
        console.log("Fetching all snapshots...");
        // Get all snapshots (paginated)
        let allSnapshots = [];
        let page = 1;
        let hasMore = true;
        while (hasMore) {
            const result = await daytona.snapshot.list(page, 50); // 50 per page
            allSnapshots.push(...result.items);
            console.log(`Fetched page ${page}: ${result.items.length} snapshots`);
            hasMore = result.totalPages > page;
            page++;
        }
        console.log(`\nTotal snapshots found: ${allSnapshots.length}`);
        if (allSnapshots.length === 0) {
            console.log("No snapshots to delete.");
            return;
        }
        console.log("\nDeleting snapshots...");
        let successCount = 0;
        let failCount = 0;
        for (const snapshot of allSnapshots) {
            try {
                console.log(`Deleting snapshot: ${snapshot.name} (${snapshot.id})...`);
                await daytona.snapshot.delete(snapshot);
                successCount++;
                console.log(`✓ Deleted: ${snapshot.name}`);
            }
            catch (error) {
                failCount++;
                console.error(`✗ Failed to delete ${snapshot.name}: ${error.message}`);
            }
        }
        console.log(`\n=== Cleanup Complete ===`);
        console.log(`Successfully deleted: ${successCount}`);
        console.log(`Failed to delete: ${failCount}`);
        console.log(`Total processed: ${snapshots.length}`);
    }
    catch (error) {
        console.error("Failed to cleanup snapshots:", error.message);
        process.exit(1);
    }
}
// Main execution
cleanupAllSnapshots();
//# sourceMappingURL=cleanup-snapshots.js.map