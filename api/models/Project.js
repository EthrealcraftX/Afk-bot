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
  },
  // The OS PID of the most recently spawned child process.
  // Persisted so syncStatusOnBoot() can attempt to SIGTERM orphaned processes
  // that survived a server restart. Set to null when the process is stopped cleanly.
  lastPid: {
    type: Number,
    default: null
  },
  // Wall-clock timestamp recorded immediately after spawn() returned.
  // Used by syncStatusOnBoot() to confirm that the PID in lastPid still belongs
  // to our process and was not recycled by the OS. A recycled PID will always
  // have a later OS start time than this recorded timestamp.
  lastPidStartedAt: {
    type: Date,
    default: null
  }
});

module.exports = mongoose.model('Project', ProjectSchema);
