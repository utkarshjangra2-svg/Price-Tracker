const fs = require('fs');
const log = fs.readFileSync('C:/Users/dell/.gemini/antigravity/brain/efbf91b5-197d-4e44-8988-912ab5740a0e/.system_generated/logs/overview.txt', 'utf8');

const files = {};

log.split('\n').forEach(line => {
  try {
    const parsed = JSON.parse(line);
    if (parsed.tool_calls) {
      parsed.tool_calls.forEach(tc => {
        let args = tc.args;
        if (typeof args === 'string') {
          try { args = JSON.parse(args); } catch(e){}
        }
        if (!args || !args.TargetFile) return;
        
        const f = args.TargetFile.replace(/\"/g, "");
        if (!files[f]) {
           if (tc.name === 'replace_file_content' && args.TargetContent) {
             files[f] = args.TargetContent;
           } else if (tc.name === 'multi_replace_file_content') {
             console.log(`First touch to ${f} was multi_replace_file_content!`);
           } else if (tc.name === 'write_to_file') {
             console.log(`First touch to ${f} was write_to_file!`);
           }
        }
      });
    }
  } catch(e){}
});

for (let file in files) {
   let content = files[file];
   if (typeof content === 'string') {
      try { content = JSON.parse(`"${content}"`); } catch(e){}
   }
   console.log(`Writing backup for ${file}...`);
   const newPath = file + ".backupMay2";
   fs.writeFileSync(newPath, content);
}
