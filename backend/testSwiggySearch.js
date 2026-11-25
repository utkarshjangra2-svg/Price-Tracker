import { connectSwiggyFoodMcp } from './services/swiggyFoodMcpService.js';

async function test() {
  try {
    const connection = await connectSwiggyFoodMcp();
    console.log('Connected:', connection.status);
    console.log('Tools available:', connection.tools.map(t => t.name).join(', '));
    
    // Get the search_restaurants tool
    const searchTool = connection.tools.find(t => t.name === 'search_restaurants');
    if (!searchTool) {
      console.log('search_restaurants tool not found!');
      return;
    }
    
    console.log('\nsearch_restaurants input schema:', JSON.stringify(searchTool.inputSchema, null, 2));
    
    // Try to call it with different parameter sets
    console.log('\n\nAttempting to call search_restaurants...');
    
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
    
    const SWIGGY_MCP_URL = process.env.SWIGGY_FOOD_MCP_URL || 'https://mcp.swiggy.com/food';
    const transport = new StdioClientTransport({
      command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
      args: ['-y', 'mcp-remote', SWIGGY_MCP_URL]
    });
    
    const client = new Client(
      { name: 'test-client', version: '1.0.0' },
      { capabilities: {} }
    );
    
    await client.connect(transport);
    
    // First, get addresses
    console.log('\nCalling get_addresses...');
    const addressResult = await client.callTool({
      name: 'get_addresses',
      arguments: {}
    });
    
    console.log('Addresses result:', JSON.stringify(addressResult, null, 2));
    
    // Extract first address ID
    let addresses = [];
    if (addressResult?.content?.[0]?.text) {
      try {
        const parsed = JSON.parse(addressResult.content[0].text);
        addresses = parsed.addresses || parsed.data?.addresses || [];
      } catch {
        console.log('Could not parse addresses');
      }
    }
    
    if (!addresses.length) {
      console.log('No addresses found');
      await client.close();
      return;
    }
    
    const addressId = addresses[0].address_id || addresses[0].id;
    console.log(`\nUsing addressId: ${addressId}`);
    
    // Now call search_restaurants with valid addressId
    console.log('\nCalling search_restaurants with valid addressId...');
    const result = await client.callTool({
      name: 'search_restaurants',
      arguments: {
        query: 'rasgulla',
        addressId: addressId
      }
    });
    
    console.log('Result:', JSON.stringify(result, null, 2));
    
    await client.close();
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Full error:', error);
  }
}

test();
