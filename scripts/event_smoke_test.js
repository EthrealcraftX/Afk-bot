const api = require('../api/api');
api.initialize();
const user = 'smoketest';
try{ api.createUser(user,'secret'); } catch (e){}
const res = api.createServer('127.0.0.1',25565,'1.16.5','java', user);
console.log('created', res);
api.appendEvent(res.projectId, 'Bot username: Bot1 — created', 'info');
api.appendEvent(res.projectId, 'Bot username: Bot1 — connected', 'info');
api.appendEvent(res.projectId, 'Bot username: Bot1 — Error: connect ECONNREFUSED', 'error');
const ev = api.getServerEvents(res.projectId, user, 20);
console.log('events:', ev);
