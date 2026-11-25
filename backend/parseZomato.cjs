const fs = require('fs');

const html = fs.readFileSync('zomato_ladoo.html', 'utf8');
const match = html.match(/window\.__PRELOADED_STATE__ = JSON\.parse\("(.*?)"\);/);

if (match) {
  try {
    // Unescape the JSON string
    const jsonString = match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    const data = JSON.parse(jsonString);
    fs.writeFileSync('zomato_state.json', JSON.stringify(data, null, 2));
    console.log('Saved to zomato_state.json, length:', jsonString.length);
  } catch (e) {
    console.error('Parse error:', e.message);
  }
} else {
  console.log('No match found');
}
