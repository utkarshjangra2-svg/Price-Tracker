import { connectToZomatoMcp, getZomatoMcpTools } from "./backend/services/zomatoOfficialMcp.js";
import dotenv from "dotenv";

dotenv.config({ path: "./backend/.env" });

async function main() {
  console.log("Connecting to Zomato MCP...");
  const res = await connectToZomatoMcp();
  console.log("Status:", res.status);
  const tools = getZomatoMcpTools();
  tools.forEach(t => console.log(t.name, t.description));
  process.exit(0);
}

main();
