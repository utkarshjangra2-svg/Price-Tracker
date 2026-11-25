import { connectToZomatoMcp, getZomatoMcpTools, callZomatoMcpTool } from "./backend/services/zomatoOfficialMcp.js";
import dotenv from "dotenv";

dotenv.config({ path: "./backend/.env" });

async function main() {
  await connectToZomatoMcp();
  const res = await callZomatoMcpTool("get_restaurants_for_keyword", { keyword: "pizza" });
  if (res.result && res.result[0] && res.result[0].text) {
    const data = JSON.parse(res.result[0].text);
    const restaurants = data.results || [];
    if (restaurants.length > 0) {
      console.log("Items in first restaurant:");
      console.log(JSON.stringify(restaurants[0].items.slice(0, 2), null, 2));
    }
  }
  process.exit(0);
}

main();
