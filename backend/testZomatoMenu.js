

async function test() {
  try {
    const orderUrl = 'https://www.zomato.com/ncr/behrouz-biryani-nit-faridabad/order';
    const pageUrl = new URL(orderUrl).pathname;
    const apiUrl = `https://www.zomato.com/webroutes/getPage?page_url=${pageUrl}`;
    
    console.log(`Fetching Zomato api: ${apiUrl}`);
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      console.log(`Failed to fetch: ${response.status} ${response.statusText}`);
      return;
    }
    
    const data = await response.json();
    console.log('Successfully fetched Zomato page data.');
    
    const menus = data?.page_data?.order?.menuList?.menus || [];
    console.log(`Found ${menus.length} menus.`);
    
    const items = [];
    let firstWrapper = null;
    for (const m of menus) {
      if (!m.menu?.categories) continue;
      for (const cat of m.menu.categories) {
        if (!cat.category?.items) continue;
        for (const i of cat.category.items) {
          if (!firstWrapper) firstWrapper = i;
          if (i.item && i.item.name) {
            items.push({ item: i.item, wrapper: i });
          }
        }
      }
    }
    
    console.log(`Found ${items.length} items total.`);
    console.log('Order keys:', Object.keys(data?.page_data?.order || {}));
    console.log('menuList keys:', Object.keys(data?.page_data?.order?.menuList || {}));
    
    // Check if there is an item_pricing or prices or variants field anywhere in menuList
    function searchKeys(obj, path = '') {
      if (!obj || typeof obj !== 'object') return;
      for (const key of Object.keys(obj)) {
        if (key.toLowerCase().includes('price') || key.toLowerCase().includes('cost') || key.toLowerCase().includes('amount') || key.toLowerCase().includes('rate')) {
          console.log(`Found matching key "${key}" at path: ${path}.${key}`);
        }
        searchKeys(obj[key], `${path}.${key}`);
      }
    }
    searchKeys(data?.page_data?.order, 'order');
  } catch (e) {
    console.error('Error:', e.message);
  }
}

test();
