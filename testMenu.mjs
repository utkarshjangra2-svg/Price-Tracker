import axios from 'axios';


async function run() {
  try {
    const { data } = await axios.get('https://www.zomato.com/ncr/haldirams-sector-12-faridabad/order', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });
    const jsonLdRegex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
    let match;
    const parsed = [];
    while ((match = jsonLdRegex.exec(data)) !== null) {
      try {
        parsed.push(JSON.parse(match[1]));
      } catch (e) {}
    }
    console.log(JSON.stringify(parsed, null, 2));
  } catch (e) {
    console.error(e.response ? e.response.status : e.message);
  }
}
run();
