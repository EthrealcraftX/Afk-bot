const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  passwordHash: {
    type: String,
    required: true
  },
  projects: {
    type: [String],
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  // Monotonically incrementing counter. Embedded in every JWT as 'tv'.
  // Incrementing this value instantly invalidates all previously issued tokens
  // for this user without needing a token blacklist.
  // Trigger events: password change, password overwrite, account disable/revoke.
  tokenVersion: {
    type: Number,
    default: 0
  }
});

module.exports = mongoose.model('User', UserSchema);
