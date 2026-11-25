import { spawn } from "child_process";

console.log("Starting Zomato MCP probe...");
const p = spawn("npx.cmd", ["-y", "mcp-remote", "https://mcp-server.zomato.com/mcp"], {
  stdio: ["pipe", "pipe", "pipe"],
  shell: true
});

p.stdout.on("data", (data) => {
  console.log("[OUT]", data.toString());
});

p.stderr.on("data", (data) => {
  console.log("[ERR]", data.toString());
});

setTimeout(() => {
  console.log("Stopping probe...");
  p.kill();
  process.exit(0);
}, 10000);
