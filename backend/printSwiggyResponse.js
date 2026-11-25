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
      { name: 'test-print-client', version: '1.0.0' },
      { capabilities: {} }
    );
    
    await client.connect(transport);
    
    // First, get addresses
    const addressResult = await client.callTool({
      name: 'get_addresses',
      arguments: {}
    });
    
    let addresses = [];
    if (addressResult?.structuredContent?.addresses) {
      addresses = addressResult.structuredContent.addresses;
    }
    
    if (!addresses.length) {
      console.log('No addresses found');
      await client.close();
      return;
    }
    
    const addressId = addresses[0].id || addresses[0].address_id;
    
    console.log('Calling search_restaurants for "halwa"...');
    const result = await client.callTool({
      name: 'search_restaurants',
      arguments: {
        query: 'halwa',
        addressId: addressId
      }
    });
    
    console.log('\nParsed result:');
    if (result?.structuredContent) {
      console.log(JSON.stringify(result.structuredContent, null, 2));
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
    
    await client.close();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

test();
