import fs from 'fs';
const file = 'c:/Users/dell/Downloads/Price Optimizer (2) (1)/Price Optimizer (6)/Price Optimizer/backend/services/zomatoService.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /if \(!locationData\) \{\s*console\.warn\("\[fetchMcpDeals\] No location data provided\. Prompting user to add an address\."\);\s*throw new Error\("Zomato MCP requires at least one saved address\. Please add a delivery address in your profile first\."\);\s*\}/g,
  'if (!locationData) {\n    console.warn("[fetchMcpDeals] No location data provided. Falling back to web scraper with text location.");\n  }'
);

fs.writeFileSync(file, content);
console.log("Replaced successfully");
