const { loadVersions, getOpenTicketCount } = require('./store');

function kbVersions(type) {
  const versions = loadVersions(type);
  const rows = [];
  // Chunk versions into rows of 2 buttons
  for (let i = 0; i < versions.length; i += 2) {
    const row = [];
    row.push({ text: `🏷 ${versions[i]}`, callback_data: `setversion_${versions[i]}` });
    if (i + 1 < versions.length) {
      row.push({ text: `🏷 ${versions[i+1]}`, callback_data: `setversion_${versions[i+1]}` });
    }
    rows.push(row);
  }
  rows.push([{ text: '❌  Bekor qilish', callback_data: 'menu' }]);
  return { inline_keyboard: rows };
}

function kbMain(loggedIn, isAdmin = false) {
  const rows = [
    [
      { text: '📋  Serverlarim',      callback_data: 'list_servers'  },
      { text: '➕  Server qo\'shish', callback_data: 'create_server' }
    ],
    [
      { text: '📊  Statistika',      callback_data: 'stats'      },
      { text: '🔔  So\'nggi hodisalar', callback_data: 'all_events' }
    ],
    [
      { text: '💬  Yordam so\'rash', callback_data: 'support_new' },
      { text: '❓  Ma\'lumot',       callback_data: 'help'        }
    ],
    [
      { text: '📹  Video yordam',     callback_data: 'send_help_video' }
    ]
  ];

  if (isAdmin) {
    const openCount = getOpenTicketCount();
    const badge = openCount > 0 ? ` (${openCount})` : '';
    rows.push([
      { text: `🛡  Admin Panel${badge}`, callback_data: 'admin_panel' }
    ]);
  }

  return { inline_keyboard: rows };
}

function kbServer(projectId, status) {
  const running = status === 'running';
  return {
    inline_keyboard: [
      [
        running
          ? { text: '⏹  To\'xtatish', callback_data: `srvstop_${projectId}` }
          : { text: '▶️  Ishga tushirish', callback_data: `srvstart_${projectId}` },
        { text: '🗑  O\'chirish', callback_data: `srvdel_${projectId}` }
      ],
      [
        { text: '📄  Loglar',   callback_data: `srvlogs_${projectId}`   },
        { text: '📋  Hodisalar', callback_data: `srvevents_${projectId}` }
      ],
      [
        { text: '👥  O\'yinchilar', callback_data: `srvplayers_${projectId}` },
        { text: '🔄  Yangilash',       callback_data: `srvinfo_${projectId}` }
      ],
      [
        { text: '✏️  Botni tahrirlash', callback_data: `srvedit_${projectId}` }
      ],
      [
        { text: '🔙  Barcha serverlar', callback_data: 'list_servers'         }
      ]
    ]
  };
}

/**
 * Keyboard for the /edit reply — contains only the Web App edit button.
 * @param {string} projectId
 * @param {string} token  - user JWT for the edit URL
 */
function kbEditMiniApp(projectId, token) {
  const { WEB_APP_URL, IS_HTTPS } = require('./config');
  const url = `${WEB_APP_URL}/edit?token=${encodeURIComponent(token)}&project=${encodeURIComponent(projectId)}`;
  const button = IS_HTTPS 
    ? { text: '✏️ Bot edit qilish', web_app: { url } }
    : { text: '✏️ Bot edit qilish (Brauzerda)', url };

  return {
    inline_keyboard: [
      [ button ],
      [
        { text: '🔙  Serverga qaytish', callback_data: `srvinfo_${projectId}` }
      ]
    ]
  };
}

function kbBack(target = 'menu') {
  const map = {
    menu:    { text: '🏠  Asosiy menyu',       callback_data: 'menu'         },
    servers: { text: '🔙  Barcha serverlar',   callback_data: 'list_servers' },
    admin:   { text: '🔙  Admin paneli',       callback_data: 'admin_panel'  }
  };
  return { inline_keyboard: [[ map[target] ?? map.menu ]] };
}

function kbCancel() {
  return { inline_keyboard: [[ { text: '❌  Bekor qilish', callback_data: 'menu' } ]] };
}

function kbCancelAdmin() {
  return { inline_keyboard: [[ { text: '❌  Bekor qilish', callback_data: 'admin_panel' } ]] };
}

function kbServerType() {
  return {
    inline_keyboard: [
      [
        { text: '☕  Java Edition',    callback_data: 'settype_java'    },
        { text: '🟩  Bedrock Edition', callback_data: 'settype_bedrock' }
      ],
      [{ text: '❌  Bekor qilish', callback_data: 'menu' }]
    ]
  };
}

function kbDeleteConfirm(projectId) {
  return {
    inline_keyboard: [
      [
        { text: '✅  Ha, o\'chirish',   callback_data: `confirmdel_${projectId}` },
        { text: '❌  Yo\'q, bekor',     callback_data: `srvinfo_${projectId}`    }
      ]
    ]
  };
}

function kbAdminPanel() {
  const openCount = getOpenTicketCount();
  const badge = openCount > 0 ? ` (${openCount})` : '';
  return {
    inline_keyboard: [
      [
        { text: '🖥  Barcha serverlar', callback_data: 'admin_servers' },
        { text: '👥  Foydalanuvchilar', callback_data: 'admin_users'   }
      ],
      [
        { text: `💬  Ticketlar${badge}`, callback_data: 'admin_support'   },
        { text: '📢  Xabar yuborish',    callback_data: 'admin_broadcast' }
      ],
      [
        { text: '🏷  Versiyalarni boshqarish', callback_data: 'admin_versions' }
      ],
      [{ text: '🏠  Asosiy menyu', callback_data: 'menu' }]
    ]
  };
}

function kbAdminBack() {
  return { inline_keyboard: [[ { text: '🔙  Admin paneli', callback_data: 'admin_panel' } ]] };
}

function kbBroadcastConfirm() {
  return {
    inline_keyboard: [
      [
        { text: '✅  Hammaga yuborish', callback_data: 'bcast_confirm' },
        { text: '❌  Bekor qilish',     callback_data: 'admin_panel'   }
      ]
    ]
  };
}

module.exports = {
  kbVersions,
  kbMain,
  kbServer,
  kbEditMiniApp,
  kbBack,
  kbCancel,
  kbCancelAdmin,
  kbServerType,
  kbDeleteConfirm,
  kbAdminPanel,
  kbAdminBack,
  kbBroadcastConfirm
};
