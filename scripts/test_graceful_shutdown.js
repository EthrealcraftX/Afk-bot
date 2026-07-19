const cp = require('child_process');

function runTest(name, signal, timeoutMs) {
  return new Promise((resolve) => {
    console.log(`\\n--- Test: ${name} (${signal || 'Exception'}) ---`);
    const env = { ...process.env, JWT_SECRET: 'test', MONGODB_URI: 'mongodb://192.0.2.1:27017/hang' };
    
    let args = [];
    if (signal) {
      args = ['-e', `
        require('./server.js');
        setTimeout(() => { console.log('Simulating ${signal}...'); process.emit('${signal}'); }, 1000);
      `];
    } else {
      args = ['-e', `
        require('./server.js');
        setTimeout(() => { throw new Error('Simulated Fatal Error'); }, 1000);
      `];
    }

    const child = cp.spawn('node', args, { env });
    let out = '';

    child.stdout.on('data', (d) => {
      process.stdout.write(`[STDOUT] ${d}`);
      out += d;
    });
    child.stderr.on('data', (d) => {
      process.stdout.write(`[STDERR] ${d}`);
      out += d;
    });

    // Signals are now simulated via process.emit internally to avoid Windows hard-kill behavior

    child.on('close', (code) => {
      console.log(`Child exited with code ${code}`);
      if (out.includes('Shutting down gracefully...')) {
        console.log('PASSED: Graceful shutdown was executed.');
      } else {
        console.error('FAILED: Graceful shutdown did not run!');
      }
      resolve();
    });
  });
}

async function main() {
  await runTest('SIGINT Handling', 'SIGINT', 1000);
  await runTest('SIGTERM Handling', 'SIGTERM', 1000);
  await runTest('uncaughtException Handling', null, 1000);
}

main();
