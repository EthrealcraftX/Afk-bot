const fetch = require('node-fetch');
const api = require('../api/api');

async function run(){
  api.initialize();
  const username = 'testuser2';
  try{ api.createUser(username, 'secret'); } catch(e){}
  const created = api.createServer('127.0.0.1', 25565, '1.16.5', 'java', username);
  console.log('created', created);
  const projectId = created.projectId;

  // get token by calling authenticateUser directly
  const auth = api.authenticateUser(username, 'secret');
  console.log('auth', auth);
  const token = auth.token;

  // call HTTP endpoint
  const port = process.env.PORT || 3000;
  const url = `http://localhost:${port}/api/projects/${projectId}/events?lines=200`;
  console.log('Fetching', url);
  try {
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    console.log('status', res.status);
    const j = await res.text();
    console.log('body:', j);
  } catch (err) {
    console.error('err', err);
  }
}

run().catch(err=>{ console.error('err', err); process.exit(1); });