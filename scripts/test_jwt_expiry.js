process.env.JWT_SECRET = 'test_secret';

const api = require('../api/api');
const jwt = require('jsonwebtoken');
const User = require('../api/models/User');

async function testAuthentication() {
  console.log('Testing JWT_EXPIRY_TIME fix...');
  
  // Mock User.findOne to return a valid user with passwordHash
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync('test_password', 10);
  
  User.findOne = async () => ({ 
    username: 'testuser',
    passwordHash: hash,
    tokenVersion: 1
  });

  try {
    const result = await api.authenticateUser('testuser', 'test_password');
    console.log('Auth Result:', result);
    
    if (result.success && result.token) {
      const decoded = jwt.decode(result.token);
      console.log('Decoded Token:', decoded);
      
      if (decoded.exp) {
        console.log('PASSED: Token contains expiration timestamp.');
        process.exit(0);
      } else {
        console.error('FAILED: Token does not contain expiration timestamp.');
        process.exit(1);
      }
    } else {
      console.error('FAILED: Authentication returned failure:', result.error);
      process.exit(1);
    }
  } catch (e) {
    console.error('FAILED: Exception thrown during authentication:', e.message);
    process.exit(1);
  }
}

testAuthentication();
