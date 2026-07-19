'use strict';

function getLogger(moduleName) {
  return {
    debug: (msg, meta) => console.log(`🔍 [Status:${moduleName}]`, msg, meta ? JSON.stringify(meta) : ''),
    info:  (msg, meta) => console.log(`📋 [Status:${moduleName}]`, msg, meta ? JSON.stringify(meta) : ''),
    warn:  (msg, meta) => console.warn(`⚠️ [Status:${moduleName}]`, msg, meta ? JSON.stringify(meta) : ''),
    error: (msg, meta) => console.error(`❌ [Status:${moduleName}]`, msg, meta ? JSON.stringify(meta) : ''),
  };
}

module.exports = { getLogger };
