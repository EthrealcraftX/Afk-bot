const fetch = require('node-fetch');
(async function(){
  const port = process.env.PORT || 5000;
  const base = `http://localhost:${port}`;
  // signup
  await fetch(`${base}/api/auth/signup`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username:'httpuser', password:'secret'}) }).catch(()=>{});
  const login = await (await fetch(`${base}/api/auth/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username:'httpuser', password:'secret'}) })).json();
  console.log('login', login);
  const token = login.token;
  const create = await (await fetch(`${base}/api/projects`, { method:'POST', headers:{'Content-Type':'application/json', 'Authorization': `Bearer ${token}`}, body: JSON.stringify({ip:'127.0.0.1', port:25565, version:'1.16.5', type:'java'}) })).json();
  console.log('create', create);
  const id = create.projectId;
  const events = await (await fetch(`${base}/api/projects/${id}/events?lines=200`, { headers: { 'Authorization': `Bearer ${token}` } })).text();
  console.log('events body:', events);

  // Also invoke directly to compare
  const api = require('../api/api');
  const local = api.getServerEvents(id, 'httpuser', 200);
  console.log('getServerEvents local call:', local);
})().catch(e=>console.error('err', e));