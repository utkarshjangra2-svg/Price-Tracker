import axios from 'axios';
import * as cheerio from 'cheerio';

async function run() {
  const { data } = await axios.get('https://www.zomato.com/ncr/faridabad-restaurants?category=1&context=delivery&query=mithai', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const $ = cheerio.load(data);
  const j = $('script[type="application/ld+json"]').map((i, el) => $(el).html()).get().map(x => JSON.parse(x));
  
  const list = j.find(x => x.itemListElement && x.itemListElement[0]?.item?.['@type'] === 'Restaurant');
  if (list) {
    const all = list.itemListElement;
    const fbd = all.filter(x => JSON.stringify(x).toLowerCase().includes('faridabad'));
    console.log('Total:', all.length, 'Faridabad:', fbd.length);
  } else {
    console.log('No restaurants found');
  }
}
run().catch(console.error);
