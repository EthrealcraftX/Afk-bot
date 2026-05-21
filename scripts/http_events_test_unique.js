const fetch = require('node-fetch');
(async function(){
  const port = process.env.PORT || 5000;
  const base = `http://localhost:${port}`;
  const uname = `test_${Date.now()}`;
  await fetch(`${base}/api/auth/signup`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username:uname, password:'secret'}) });
  const login = await (await fetch(`${base}/api/auth/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username:uname, password:'secret'}) })).json();
  console.log('login', login.username, login.success);
  const token = login.token;
  const create = await (await fetch(`${base}/api/projects`, { method:'POST', headers:{'Content-Type':'application/json', 'Authorization': `Bearer ${token}`}, body: JSON.stringify({ip:'127.0.0.1', port:25565, version:'1.16.5', type:'java'}) })).json();
  console.log('create', create);
  const id = create.projectId;
  const events = await (await fetch(`${base}/api/projects/${id}/events?lines=200`, { headers: { 'Authorization': `Bearer ${token}` } })).json();
  console.log('events body:', events);
  // call directly too
  const api = require('../api/api');
  console.log('local getServerEvents:', api.getServerEvents(id, uname, 200));
})().catch(e=>console.error('err', e));