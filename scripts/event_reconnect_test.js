const api = require('../api/api');
api.initialize();
const user = 'smoketest_reconn';
try{ api.createUser(user,'secret'); } catch (e){}
const res = api.createServer('127.0.0.1',25565,'1.16.5','java', user);
console.log('created', res);
api.appendEvent(res.projectId, 'Reconnect attempt 6, retrying in 160s', 'info');
api.appendEvent(res.projectId, 'Server created by ' + user, 'info');
const ev = api.getServerEvents(res.projectId, user, 20);
console.log('events:', ev);
const all = api.getAllEvents(user, 20);
console.log('all events:', all.events ? all.events.split('\n').slice(-5).join('\n') : all);
