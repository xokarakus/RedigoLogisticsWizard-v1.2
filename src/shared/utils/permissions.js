/**
 * Permission Definitions — Sistemdeki tum yetki tanimlari
 */

const PERMISSIONS = [
  // Dashboard
  { key: 'dashboard.view', group: 'dashboard', label_en: 'View Dashboard', label_tr: 'Dashboard G\u00f6r\u00fcnt\u00fcleme' },

  // Work Orders
  { key: 'work_orders.view', group: 'work_orders', label_en: 'View Work Orders', label_tr: '\u0130\u015f Emirleri G\u00f6r\u00fcnt\u00fcleme' },
  { key: 'work_orders.process', group: 'work_orders', label_en: 'Process Work Orders', label_tr: '\u0130\u015f Emirleri \u0130\u015fleme' },

  // Inventory
  { key: 'inventory.view', group: 'inventory', label_en: 'View Inventory', label_tr: 'Envanter G\u00f6r\u00fcnt\u00fcleme' },

  // Reconciliation
  { key: 'reconciliation.view', group: 'reconciliation', label_en: 'View Reconciliation', label_tr: 'Mutabakat G\u00f6r\u00fcnt\u00fcleme' },
  { key: 'reconciliation.run', group: 'reconciliation', label_en: 'Run Reconciliation', label_tr: 'Mutabakat \u00c7al\u0131\u015ft\u0131rma' },

  // Configuration
  { key: 'config.view', group: 'config', label_en: 'View Configuration', label_tr: 'Yap\u0131land\u0131rma G\u00f6r\u00fcnt\u00fcleme' },
  { key: 'config.edit', group: 'config', label_en: 'Edit Configuration', label_tr: 'Yap\u0131land\u0131rma D\u00fczenleme' },

  // Users
  { key: 'users.view', group: 'users', label_en: 'View Users', label_tr: 'Kullan\u0131c\u0131 G\u00f6r\u00fcnt\u00fcleme' },
  { key: 'users.manage', group: 'users', label_en: 'Manage Users', label_tr: 'Kullan\u0131c\u0131 Y\u00f6netimi' },

  // Audit
  { key: 'audit.view', group: 'audit', label_en: 'View Audit Log', label_tr: 'Denetim G\u00fcnl\u00fc\u011f\u00fc G\u00f6r\u00fcnt\u00fcleme' },

  // Tenants (super admin only)
  { key: 'tenants.manage', group: 'tenants', label_en: 'Manage Tenants', label_tr: '\u015eirket Y\u00f6netimi' }
];

const GROUPS = [
  { key: 'dashboard', label_en: 'Dashboard', label_tr: 'Dashboard' },
  { key: 'work_orders', label_en: 'Work Orders', label_tr: '\u0130\u015f Emirleri' },
  { key: 'inventory', label_en: 'Inventory', label_tr: 'Envanter' },
  { key: 'reconciliation', label_en: 'Reconciliation', label_tr: 'Mutabakat' },
  { key: 'config', label_en: 'Configuration', label_tr: 'Yap\u0131land\u0131rma' },
  { key: 'users', label_en: 'Users', label_tr: 'Kullan\u0131c\u0131lar' },
  { key: 'audit', label_en: 'Audit', label_tr: 'Denetim' },
  { key: 'tenants', label_en: 'Tenants', label_tr: '\u015eirketler' }
];

// Varsayilan yetkiler
const DEFAULTS = {
  SUPER_ADMIN: Object.fromEntries(PERMISSIONS.map(p => [p.key, true])),
  TENANT_ADMIN: Object.fromEntries(PERMISSIONS.map(p => [p.key, p.key !== 'tenants.manage'])),
  TENANT_USER: {
    'dashboard.view': true,
    'work_orders.view': true,
    'work_orders.process': false,
    'inventory.view': true,
    'reconciliation.view': true,
    'reconciliation.run': false,
    'config.view': false,
    'config.edit': false,
    'users.view': false,
    'users.manage': false,
    'audit.view': false,
    'tenants.manage': false
  }
};

module.exports = { PERMISSIONS, GROUPS, DEFAULTS };
