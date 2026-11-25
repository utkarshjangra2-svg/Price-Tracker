import { fetchZomatoDeals } from "./backend/services/zomatoService.js";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: "./backend/.env" });

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const res = await fetchZomatoDeals({
      cuisine: "Momos",
      location: "Faridabad",
      user: { id: "66144e7c4f4a3e2a9c123456" }, // Dummy or use valid ID if needed
      limit: 10
    });
    console.log("Found deals:", res.deals.length);
    if (res.deals.length > 0) {
      console.log(res.deals[0]);
    }
  } catch (err) {
    console.error("Error:", err.message);
  }
  process.exit(0);
}

run();
