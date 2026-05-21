const mongoose = require('mongoose');

const ProjectSchema = new mongoose.Schema({
  projectId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  host: {
    type: String,
    required: true
  },
  port: {
    type: Number,
    required: true
  },
  version: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['java', 'bedrock'],
    required: true
  },
  status: {
    type: String,
    default: 'stopped'
  },
  owner: {
    type: String,
    required: true,
    index: true
  },
  movementInterval: {
    type: Number,
    default: 5000
  },
  reconnectHours: {
    type: Number,
    default: 2
  },
  usernameFile: {
    type: String,
    default: 'usernames.txt'
  },
  actions: {
    type: [String],
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  startedAt: {
    type: Date
  },
  stoppedAt: {
    type: Date
  }
});

module.exports = mongoose.model('Project', ProjectSchema);
