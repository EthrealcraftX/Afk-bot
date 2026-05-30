const esc = (t) => String(t ?? '').replace(/[-_*[\]()~`>#+=|{}.!\\]/g, '\\$&');

function fmtStatus(status) {
  return status === 'running' ? '🟢 Ishlayapti' : '🔴 To\'xtatilgan';
}

function fmtType(type) {
  return type === 'java' ? '☕ Java' : '🟩 Bedrock';
}

function fmtShortId(id) {
  const parts = String(id).split('_');
  return parts.slice(-1)[0] ?? id;
}

function fmtUptime(ms) {
  if (!ms || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function fmtTime(date) {
  if (!date) return '—';
  return new Date(date).toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  });
}

module.exports = {
  esc,
  fmtStatus,
  fmtType,
  fmtShortId,
  fmtUptime,
  fmtTime
};
