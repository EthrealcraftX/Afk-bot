const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Running: npm rebuild raknet-native --update-binary');
exec('npm rebuild raknet-native --update-binary', (err, stdout, stderr) => {
  const out = String(stdout || '');
  const errout = String(stderr || '');
  const timestamp = new Date().toISOString();

  // Ensure data dir exists
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  // Append to human-readable log
  const logEntry = `\n=== Rebuild at ${timestamp} ===\nExit error: ${err ? err.message : 'none'}\nSTDOUT:\n${out}\nSTDERR:\n${errout}\n`;
  fs.appendFileSync(path.join(dataDir, 'rebuild-raknet.log'), logEntry);

  // Write latest JSON
  const latest = {
    timestamp,
    success: !err,
    stdout: out.slice(0, 200000),
    stderr: errout.slice(0, 200000),
    error: err ? (err.message || String(err)) : null
  };
  fs.writeFileSync(path.join(dataDir, 'rebuild-raknet-latest.json'), JSON.stringify(latest, null, 2));

  if (err) {
    console.error('Rebuild failed:', err);
    console.error(errout);
    process.exit(1);
  }

  console.log('Rebuild output:\n', out);
  console.log('Rebuild completed. If there were no errors, try starting the bedrock bot again.');
});