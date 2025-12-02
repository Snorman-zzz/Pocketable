import { Daytona } from "@daytonaio/sdk";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables
dotenv.config({ path: path.join(__dirname, "../.env") });

async function cleanupAllSnapshots() {
  if (!process.env.DAYTONA_API_KEY) {
    console.error("ERROR: DAYTONA_API_KEY must be set");
    process.exit(1);
  }

  const daytona = new Daytona({
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
      } catch (error: any) {
        failCount++;
        console.error(`✗ Failed to delete ${snapshot.name}: ${error.message}`);
      }
    }

    console.log(`\n=== Cleanup Complete ===`);
    console.log(`Successfully deleted: ${successCount}`);
    console.log(`Failed to delete: ${failCount}`);
    console.log(`Total processed: ${snapshots.length}`);

  } catch (error: any) {
    console.error("Failed to cleanup snapshots:", error.message);
    process.exit(1);
  }
}

// Main execution
cleanupAllSnapshots();
