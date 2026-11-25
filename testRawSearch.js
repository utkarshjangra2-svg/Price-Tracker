import { callZomatoMcpTool } from "./backend/services/zomatoOfficialMcp.js";
import dotenv from "dotenv";

dotenv.config({ path: "./backend/.env" });

async function run() {
  try {
    const res = await callZomatoMcpTool("get_restaurants_for_keyword", {
      keyword: "momos",
      address_id: "946124482" // Faridabad address
    });
    if (res.success) {
      const parsed = JSON.parse(res.result[0].text);
      console.log(JSON.stringify(parsed.results[0], null, 2));
    }
  } catch (err) {
    console.error("Error:", err.message);
  }
  process.exit(0);
}

run();
