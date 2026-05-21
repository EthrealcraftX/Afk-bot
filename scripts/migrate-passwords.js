const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const usersPath = path.join(__dirname, '..', 'data', 'users.json');

if (!fs.existsSync(usersPath)) {
  console.error('No users.json found at', usersPath);
  process.exit(1);
}

const users = JSON.parse(fs.readFileSync(usersPath, 'utf8')) || {};
let migrated = false;

for (const [username, user] of Object.entries(users)) {
  if (user.password) {
    console.log(`Migrating user ${username}`);
    user.passwordHash = bcrypt.hashSync(user.password, 10);
    delete user.password;
    migrated = true;
  }
}

if (migrated) {
  fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
  console.log('Migration complete. Please restart the server.');
} else {
  console.log('No plaintext passwords found. Nothing to do.');
}