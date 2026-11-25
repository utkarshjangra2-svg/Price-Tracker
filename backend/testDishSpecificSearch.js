import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { fetchMcpDeals } from "./services/zomatoService.js";
import { connectToZomatoMcp } from "./services/zomatoOfficialMcp.js";
import { connectSwiggyFoodMcp } from "./services/swiggyFoodMcpService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, ".env") });

async function runTest() {
  console.log("=== STARTING DISH-SPECIFIC FILTERING TEST ===");
  console.log("Connecting to MCP services...");

  if (process.env.USE_ZOMATO_MCP === "true") {
    try {
      const zRes = await connectToZomatoMcp();
      console.log(`[Zomato MCP] Connected: ${zRes.status}`);
    } catch (e) {
      console.log(`[Zomato MCP] Connection error: ${e.message}`);
    }
  }

  try {
    const sRes = await connectSwiggyFoodMcp();
    console.log(`[Swiggy Food MCP] Connected: ${sRes.status}`);
  } catch (e) {
    console.log(`[Swiggy Food MCP] Connection error: ${e.message}`);
  }

  const query = "halwa";
  const location = "Faridabad";

  console.log(`\nExecuting search for "${query}" in "${location}"...`);

  try {
    const result = await fetchMcpDeals({
      location,
      cuisine: query,
      limit: 10,
      providers: ["zomato", "swiggy"]
    });

    console.log("\n=== TEST RESULTS ===");
    console.log(`Total deals returned: ${result?.deals?.length || 0}`);
    
    // We can also trace the service's raw deals if we call the fetchMcpDeals or inspect its intermediate state.
    // Let's print out what result is
    console.log("Result source:", result?.source);
    
    const zomatoDeals = (result?.deals || []).filter(d => d.platform === "Zomato");
    const swiggyDeals = (result?.deals || []).filter(d => d.platform === "Swiggy");

    console.log(`\n--- Zomato Deals (${zomatoDeals.length}) ---`);
    zomatoDeals.forEach((d, idx) => {
      console.log(`${idx + 1}. [${d.restaurant}] - ${d.name} (₹${d.price})`);
      console.log(`   Image: ${d.imageUrl}`);
      console.log(`   Is Live: ${d.isLive}, Verified: ${d.verified}`);
    });

    console.log(`\n--- Swiggy Deals (${swiggyDeals.length}) ---`);
    swiggyDeals.forEach((d, idx) => {
      console.log(`${idx + 1}. [${d.restaurant}] - ${d.name} (₹${d.price})`);
      console.log(`   Image: ${d.imageUrl}`);
      console.log(`   Is Live: ${d.isLive}, Verified: ${d.verified}`);
    });

    console.log("\nVerification:");
    const nonHalwaDeals = (result?.deals || []).filter(d => !d.name.toLowerCase().includes("halwa"));
    if (nonHalwaDeals.length === 0) {
      console.log("✓ SUCCESS: All returned deals contain the keyword 'halwa'!");
    } else {
      console.log(`✗ FAILURE: Found ${nonHalwaDeals.length} deals that do NOT contain 'halwa':`);
      nonHalwaDeals.forEach(d => console.log(`  - [${d.platform}] [${d.restaurant}] ${d.name}`));
    }

  } catch (error) {
    console.error("Error running deal search:", error.message);
  }

  process.exit(0);
}

runTest();
