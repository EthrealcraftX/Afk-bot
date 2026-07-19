process.env.JWT_SECRET = 'test_secret';

const express = require('express');
const jwt = require('jsonwebtoken');

async function runTest() {
  const Notification = require('../api/models/Notification');
  Notification.create = async () => {};
  const User = require('../api/models/User');
  User.findOne = async () => ({ username: 'testuser' });
  
  const routes = require('../api/routes');

  const app = express();
  app.use(express.json());
  app.use('/api', routes);

  // Mock authenticate middleware behavior by generating a valid token
  const token = jwt.sign({ username: 'testuser' }, 'test_secret');
  
  const server = app.listen(0, async () => {
    const port = server.address().port;
    const url = `http://localhost:${port}/api/notifications/test`;
    
    console.log(`Test server running on port ${port}`);
    let hitLimit = false;
    let limitMessage = '';

    for (let i = 1; i <= 6; i++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ projectId: 'test' })
        });

        const json = await res.json();
        console.log(`Request ${i} -> Status: ${res.status}, Body: ${JSON.stringify(json)}`);
        
        if (res.status === 429) {
          hitLimit = true;
          limitMessage = json.error;
        }
      } catch (err) {
        console.error(`Request ${i} failed:`, err);
      }
    }

    if (hitLimit && limitMessage.includes('Too many test notifications')) {
      console.log('\\nPASSED: Rate limit correctly triggered on the 6th request with the standard JSON format.');
    } else {
      console.error('\\nFAILED: Rate limit did not trigger as expected.');
    }

    server.close();
    process.exit(0);
  });
}

runTest();
