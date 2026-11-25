import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { connectSwiggyFoodMcp, searchSwiggyFood, fetchSwiggyRestaurantMenu } from "./services/swiggyFoodMcpService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, ".env") });

async function debug() {
  await connectSwiggyFoodMcp();
  const searchRes = await searchSwiggyFood({ query: "halwa", location: "Faridabad", limit: 5 });
  console.log("Restaurants found:", searchRes.restaurants.map(r => `${r.restaurant} (ID: ${r.id})`));
  
  if (searchRes.addressId) {
    for (const r of searchRes.restaurants.slice(0, 5)) {
      const items = await fetchSwiggyRestaurantMenu({ restaurantId: r.id, addressId: searchRes.addressId });
      console.log(`\nItems for ${r.restaurant}:`);
      items.slice(0, 10).forEach(item => {
        console.log(`- ${item.name} (₹${item.price})`);
      });
      const matches = items.filter(item => item.name.toLowerCase().includes("halwa"));
      console.log(`Halwa matches:`, matches.map(m => m.name));
    }
  }
  process.exit(0);
}
debug();
