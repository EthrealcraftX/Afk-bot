'use strict';

/**
 * notificationService.js
 * Saves and retrieves bot error notifications from MongoDB.
 *
 * All public functions are async and never throw — errors are caught
 * and logged to console so a DB failure never crashes the bot process.
 */

const Notification = require('../api/models/Notification');
const { sendTelegramError } = require('../bot/telegram/errorNotifier');

// ── Deduplication window: don't save the same errorCode for the
//    same project more than once per N milliseconds.
const DEDUP_WINDOW_MS = 60 * 1000; // 1 minute

// In-memory dedup tracker: key = `${projectId}:${errorCode}` → timestamp
const _lastSaved = new Map();

function _isDuplicate(projectId, errorCode) {
  const key = `${projectId}:${errorCode}`;
  const last = _lastSaved.get(key);
  if (last && (Date.now() - last) < DEDUP_WINDOW_MS) return true;
  _lastSaved.set(key, Date.now());
  return false;
}

/**
 * Save a structured notification to MongoDB.
 *
 * @param {{
 *   projectId: string,
 *   userId: string,
 *   errorCode: string,
 *   title: string,
 *   message: string,
 *   suggestion?: string,
 *   severity?: 'info'|'warning'|'error',
 *   rawError?: string
 * }} data
 * @returns {Promise<boolean>} true if saved, false if skipped/failed
 */
async function saveNotification(data) {
  const { projectId, userId, errorCode, title, message, suggestion = '', severity = 'error', rawError = '' } = data;

  if (!projectId || !userId || !errorCode || !title || !message) {
    console.error('[NotificationService] saveNotification: missing required fields', { projectId, userId, errorCode });
    return false;
  }

  // Deduplicate — suppress repeated identical errors within the window
  if (_isDuplicate(projectId, errorCode)) {
    return false;
  }

  let saved = false;
  try {
    await Notification.create({
      projectId,
      userId,
      errorCode,
      title,
      message,
      suggestion,
      severity,
      rawError: String(rawError).slice(0, 500), // cap raw error length
      isRead: false,
      createdAt: new Date()
    });
    saved = true;
  } catch (err) {
    // Never crash the calling process because of a notification save failure
    console.error('[NotificationService] Failed to save notification:', err.message || err);
    return false;
  }

  // Fire-and-forget Telegram notification (never propagate errors)
  if (saved) {
    sendTelegramError({
      projectId,
      projectName: data.projectName || projectId,
      userId,
      errorCode,
      rawError,
      userToken: data.userToken || null,
      createdAt: new Date()
    }).catch((e) => {
      console.error('[NotificationService] sendTelegramError failed:', e.message || e);
    });
  }

  return true;
}

/**
 * Get recent notifications for a user (newest first).
 *
 * @param {string} userId
 * @param {{ limit?: number, unreadOnly?: boolean }} [opts]
 * @returns {Promise<Array>}
 */
async function getNotifications(userId, opts = {}) {
  const { limit = 50, unreadOnly = false } = opts;

  if (!userId) return [];

  try {
    const query = { userId };
    if (unreadOnly) query.isRead = false;

    const docs = await Notification
      .find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(limit) || 50, 200))
      .lean();

    return docs;
  } catch (err) {
    console.error('[NotificationService] Failed to get notifications:', err.message || err);
    return [];
  }
}

/**
 * Count unread notifications for a user.
 *
 * @param {string} userId
 * @returns {Promise<number>}
 */
async function getUnreadCount(userId) {
  if (!userId) return 0;
  try {
    return await Notification.countDocuments({ userId, isRead: false });
  } catch (err) {
    console.error('[NotificationService] Failed to count unread:', err.message || err);
    return 0;
  }
}

/**
 * Mark a single notification as read.
 *
 * @param {string} notificationId  - MongoDB _id
 * @param {string} userId          - must match the owner to prevent cross-user reads
 * @returns {Promise<boolean>}
 */
async function markAsRead(notificationId, userId) {
  if (!notificationId || !userId) return false;
  try {
    const result = await Notification.updateOne(
      { _id: notificationId, userId },
      { $set: { isRead: true } }
    );
    return result.modifiedCount > 0;
  } catch (err) {
    console.error('[NotificationService] Failed to mark as read:', err.message || err);
    return false;
  }
}

/**
 * Mark ALL notifications for a user as read.
 *
 * @param {string} userId
 * @returns {Promise<number>} count of updated documents
 */
async function markAllAsRead(userId) {
  if (!userId) return 0;
  try {
    const result = await Notification.updateMany(
      { userId, isRead: false },
      { $set: { isRead: true } }
    );
    return result.modifiedCount;
  } catch (err) {
    console.error('[NotificationService] Failed to mark all as read:', err.message || err);
    return 0;
  }
}

/**
 * Delete a single notification.
 *
 * @param {string} notificationId
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
async function deleteNotification(notificationId, userId) {
  if (!notificationId || !userId) return false;
  try {
    const result = await Notification.deleteOne({ _id: notificationId, userId });
    return result.deletedCount > 0;
  } catch (err) {
    console.error('[NotificationService] Failed to delete notification:', err.message || err);
    return false;
  }
}

/**
 * Save a test notification (for debugging the pipeline end-to-end).
 *
 * @param {string} userId
 * @param {string} projectId
 * @returns {Promise<boolean>}
 */
async function saveTestNotification(userId, projectId) {
  return saveNotification({
    projectId: projectId || 'test_project',
    userId,
    errorCode: 'TEST',
    title: 'Test Notification',
    message: 'This is a test notification triggered manually via the API.',
    suggestion: 'If you see this, the notification system is working correctly.',
    severity: 'info',
    rawError: 'manual test trigger'
  });
}

module.exports = {
  saveNotification,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  saveTestNotification
};
