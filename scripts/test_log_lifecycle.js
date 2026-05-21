const fs = require('fs');
const path = require('path');
const api = require('../api/api');

async function sleep(ms){ return new Promise(res=>setTimeout(res, ms)); }

async function run(){
  console.log('Initializing DB...');
  api.initialize();

  const username = 'testuser';
  try{ api.createUser(username, 'secret'); } catch(e){}

  console.log('Creating server...');
  const res = api.createServer('127.0.0.1', 25565, '1.16.5', 'java', username);
  if(!res.success){ console.error('createServer failed:', res); process.exit(2); }
  const projectId = res.projectId;
  console.log('Created', projectId);

  const logsDir = path.join(__dirname, '..', 'data', 'logs');
  const logPath = path.join(logsDir, `${projectId}.log`);

  console.log('Starting server...');
  const start = api.startServer(projectId, username);
  if(!start.success){ console.error('startServer failed:', start); process.exit(3); }
  console.log('Started. pid=', start.pid);

  await sleep(1500);

  const existsAfterStart = fs.existsSync(logPath);
  console.log('Log exists after start?', existsAfterStart);
  if(!existsAfterStart) { console.error('Expected log file to exist after start'); }

  const logs = api.getServerLogs(projectId, username, 50);
  console.log('Tail size:', (logs.log||'').split('\n').length);

  // Check events
  const events = api.getServerEvents(projectId, username, 50);
  console.log('Events tail length:', (events.events||'').split('\n').length);

  console.log('Stopping server...');
  const stop = api.stopServer(projectId, username);
  if(!stop.success){ console.error('stopServer failed', stop); }
  await sleep(500);

  const existsAfterStop = fs.existsSync(logPath);
  console.log('Log exists after stop?', existsAfterStop);
  if(existsAfterStop) { console.error('Expected log to be deleted on stop'); }

  console.log('Starting server again to test deleteServer...');
  const start2 = api.startServer(projectId, username);
  if(!start2.success){ console.error('startServer failed 2nd time', start2); }
  await sleep(1000);

  console.log('Deleting server (while running)...');
  const del = api.deleteServer(projectId, username);
  console.log('deleteServer:', del);
  await sleep(500);

  const existsAfterDelete = fs.existsSync(logPath);
  console.log('Log exists after delete?', existsAfterDelete);
  if(existsAfterDelete) { console.error('Expected log to be deleted on delete'); }

  console.log('Test finished.');
}

run().catch(err=>{ console.error('Test error', err); process.exit(1); });
