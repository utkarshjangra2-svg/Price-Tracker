import axios from 'axios';
import fs from 'fs';

async function run() {
  const { data } = await axios.get('https://www.zomato.com/mumbai/delivery?query=ladoo', {
    headers: { 
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5'
    }
  });
  fs.writeFileSync('zomato_ladoo.html', data);
  console.log('Saved', data.length, 'bytes to zomato_ladoo.html');
}
run().catch(console.error);
