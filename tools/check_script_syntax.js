const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const m = html.match(/<script[^>]*>([\s\S]*)<\/script>/i);
if (!m) { console.error('No script tag found'); process.exit(2); }
const script = m[1];
console.log('Script length:', script.length);
console.log('Backtick count:', (script.match(/`/g) || []).length);
console.log('Occurrences of "<\/script>" inside script:', (script.match(/<\/script>/g) || []).length);
function countChar(ch) { return (script.match(new RegExp('\\' + ch, 'g')) || []).length; }
console.log('openParen ( :', countChar('('), 'closeParen ) :', countChar(')') );
console.log('openBrace { :', countChar('{'), 'closeBrace } :', countChar('}') );
console.log('openBracket [ :', countChar('['), 'closeBracket ] :', countChar(']') );
try {
  new Function(script);
  console.log('Script compiles (no syntax errors)');
} catch (err) {
  console.error('Syntax error in script:', err && err.message);
  // Attempt to find approximate location by binary searching the script length
  let low = 0, high = script.length, lastGood = 0;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    try {
      new Function(script.slice(0, mid));
      lastGood = mid;
      low = mid + 1;
    } catch (e) {
      high = mid - 1;
    }
  }
  const contextStart = Math.max(0, lastGood - 200);
  const contextEnd = Math.min(script.length, lastGood + 200);
  console.error('Approx failure location around index', lastGood);
  console.error('Context around failure:\n' + script.slice(contextStart, contextEnd));
  process.exit(1);
}