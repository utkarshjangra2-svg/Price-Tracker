import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function test() {
  try {
    const SWIGGY_MCP_URL = process.env.SWIGGY_FOOD_MCP_URL || 'https://mcp.swiggy.com/food';
    const transport = new StdioClientTransport({
      command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
      args: ['-y', 'mcp-remote', SWIGGY_MCP_URL]
    });
    
    const client = new Client(
      { name: 'test-menu-client', version: '1.0.0' },
      { capabilities: {} }
    );
    
    await client.connect(transport);
    
    // First, get addresses
    console.log('Calling get_addresses...');
    const addressResult = await client.callTool({
      name: 'get_addresses',
      arguments: {}
    });
    
    let addresses = [];
    if (addressResult?.structuredContent?.addresses) {
      addresses = addressResult.structuredContent.addresses;
    } else if (addressResult?.content?.[0]?.text) {
      try {
        const text = addressResult.content[0].text;
        const jsonMatch = text.match(/\{[\s\S]+?\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          addresses = parsed.addresses || parsed.data?.addresses || [];
        }
      } catch (e) {
        console.log('Error parsing addresses text');
      }
    }
    
    if (!addresses.length) {
      console.log('No addresses found');
      await client.close();
      return;
    }
    
    const addressId = addresses[0].id || addresses[0].address_id;
    console.log(`Using addressId: ${addressId}`);
    
    // Check if search_menu is available
    const listResult = await client.listTools();
    const tools = listResult.tools || [];
    const searchMenuTool = tools.find(t => t.name === 'search_menu');
    if (!searchMenuTool) {
      console.log('search_menu tool is NOT available in Swiggy Food MCP!');
      await client.close();
      return;
    }
    
    console.log('search_menu tool input schema:', JSON.stringify(searchMenuTool.inputSchema, null, 2));
    
    console.log('\nCalling search_menu for "biryani"...');
    const result = await client.callTool({
      name: 'search_menu',
      arguments: {
        query: 'biryani',
        addressId: addressId
      }
    });
    
    console.log('\nRaw search_menu result:');
    console.log(JSON.stringify(result, null, 2));
    
    await client.close();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

test();
