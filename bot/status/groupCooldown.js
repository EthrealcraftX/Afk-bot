/**
 * Per-group cooldown tracker.
 * Prevents the bot from replying to the same server address twice in the same group
 * within the cooldown window, even if many users send it.
 */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

class GroupCooldown {
  constructor() {
    this.cooldowns = new Map();
    setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
  }

  key(chatId, host, port) {
    return `cooldown:${chatId}:${host.toLowerCase()}:${port ?? 'default'}`;
  }

  isOnCooldown(chatId, host, port, cooldownMs) {
    const k = this.key(chatId, host, port);
    const expiresAt = this.cooldowns.get(k);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
      this.cooldowns.delete(k);
      return false;
    }
    return true;
  }

  setCooldown(chatId, host, port, cooldownMs) {
    this.cooldowns.set(this.key(chatId, host, port), Date.now() + cooldownMs);
  }

  cleanup() {
    const now = Date.now();
    for (const [key, expiresAt] of this.cooldowns.entries()) {
      if (now > expiresAt) this.cooldowns.delete(key);
    }
  }
}

const groupCooldown = new GroupCooldown();

module.exports = { groupCooldown, GroupCooldown };
