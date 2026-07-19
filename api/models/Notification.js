const mongoose = require('mongoose');

/**
 * Notification Mongoose Schema
 *
 * Indexed on:
 *   - userId (for fast per-user queries)
 *   - (userId + isRead) for unread count
 *   - createdAt with TTL: auto-delete after 30 days
 */
const NotificationSchema = new mongoose.Schema({
  // Which project the notification belongs to
  projectId: {
    type: String,
    required: true,
    index: true
  },

  // Owner username (same as project.owner)
  userId: {
    type: String,
    required: true,
    index: true
  },

  // Structured error code from errorCodes.js
  errorCode: {
    type: String,
    required: true
  },

  // User-facing fields
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  suggestion: {
    type: String,
    default: ''
  },

  // 'info' | 'warning' | 'error'
  severity: {
    type: String,
    enum: ['info', 'warning', 'error'],
    default: 'error'
  },

  // The original raw log line that triggered this notification
  rawError: {
    type: String,
    default: ''
  },

  // Whether the user has dismissed/read this notification
  isRead: {
    type: Boolean,
    default: false,
    index: true
  },

  // Auto-created timestamp
  createdAt: {
    type: Date,
    default: Date.now,
    // TTL index: Mongo will remove documents 30 days after createdAt
    expires: 60 * 60 * 24 * 30
  }
});

// Compound index for the most common query: get unread for a user
NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);
