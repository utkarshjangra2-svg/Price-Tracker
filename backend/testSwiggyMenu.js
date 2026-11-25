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
    console.log(`Using addressId: ${addressId}`);
    
    console.log('Calling get_restaurant_menu for Behrouz Biryani (242348)...');
    const result = await client.callTool({
      name: 'get_restaurant_menu',
      arguments: {
        restaurantId: '242348',
        addressId: addressId
      }
    });
    
    console.log('\nParsed result keys:', Object.keys(result));
    if (result?.structuredContent) {
      console.log('structuredContent keys:', Object.keys(result.structuredContent));
      const categories = result.structuredContent.categories || [];
      console.log(`Found ${categories.length} categories.`);
      if (categories.length > 0) {
        console.log('First category details:', Object.keys(categories[0]));
        const items = categories[0].items || categories[0].menuItems || [];
        console.log(`First category has ${items.length} items. First item:`);
        console.log(JSON.stringify(items[0], null, 2));
      }
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
    
    await client.close();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

test();
