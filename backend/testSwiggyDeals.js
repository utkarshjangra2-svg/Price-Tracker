import axios from 'axios';

async function testSwiggyDeals() {
  try {
    const response = await axios.post('http://localhost:5000/api/deals/search', {
      location: 'Faridabad',
      cuisine: 'rasgulla',
      budget: 0,
      locationData: null,
      user: {}
    });

    console.log('✓ Search returned status:', response.status);
    console.log('\nResponse structure:');
    console.log('- source:', response.data.source);
    console.log('- Total deals:', response.data.deals?.length || 0);
    console.log('- Zomato deals:', response.data.zomatoDeals?.length || 0);
    console.log('- Swiggy deals:', response.data.swiggyDeals?.length || 0);
    
    if (response.data.swiggyDeals?.length > 0) {
      console.log('\n✓ Swiggy deals found!');
      console.log('First Swiggy deal:', JSON.stringify(response.data.swiggyDeals[0], null, 2));
    } else {
      console.log('\n✗ No Swiggy deals in response');
    }
    
    if (response.data.diagnostics) {
      console.log('\nDiagnostics:', JSON.stringify(response.data.diagnostics, null, 2));
    }
    
    if (response.data.deals?.length > 0) {
      console.log('\nFirst deal from combined results:', JSON.stringify(response.data.deals[0], null, 2));
    }
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testSwiggyDeals();
