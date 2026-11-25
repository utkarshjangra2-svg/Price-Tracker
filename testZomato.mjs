import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';

async function testZomato() {
  const url = 'https://www.zomato.com/mumbai/delivery?query=ladoo';
  console.log('Fetching', url);
  try {
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    });
    
    fs.writeFileSync('zomato_test.html', data);
    console.log('Saved to zomato_test.html, length:', data.length);
    
    const $ = cheerio.load(data);
    
    const jsonLd = $('script[type="application/ld+json"]').map((i, el) => $(el).html()).get();
    console.log('JSON-LD blocks:', jsonLd.length);
    let foundList = false;
    for (const block of jsonLd) {
      if (block.includes('ItemList')) {
        console.log('Found ItemList! Length:', block.length);
        foundList = true;
      }
    }
    if (!foundList) console.log('No ItemList in JSON-LD');
    
    // Check for other state objects
    const scripts = $('script').map((i, el) => $(el).html()).get();
    for (const s of scripts) {
      if (s && s.includes('ladoo') && s.includes('restaurant')) {
        console.log('Found "ladoo" and "restaurant" in a script block of length:', s.length);
        console.log('Preview:', s.substring(0, 100));
      }
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testZomato();
