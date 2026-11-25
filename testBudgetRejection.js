import { fetchZomatoDeals } from "./backend/services/zomatoService.js";
import { optimizePrice } from "./backend/services/priceOptimizer.js";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: "./backend/.env" });

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const res = await fetchZomatoDeals({
      cuisine: "momos",
      location: "Faridabad",
      user: { id: "66144e7c4f4a3e2a9c123456" },
      limit: 10
    });
    
    console.log("Raw deals count:", res.deals.length);
    const optimized = res.deals.map(d => {
      const opt = optimizePrice(d, 400, { cuisine: "momos", location: "Faridabad", user: { id: "66144e7c4f4a3e2a9c123456" } });
      if (!opt) console.log(`Deal rejected for budget! name=${d.name}, base=${d.basePrice}`);
      return opt;
    })
    .filter(Boolean)
    .filter((deal) => deal.isOrderableNow && (deal.orderUrl || (deal.res_id && deal.catalogueId)) && !/\/search\?query=/.test(deal.orderUrl || ""));
    
    console.log("Optimized deals count:", optimized.length);
    if (optimized.length > 0) {
      console.log(optimized[0].finalPrice);
    }
  } catch (err) {
    console.error("Error:", err.message);
  }
  process.exit(0);
}

run();
