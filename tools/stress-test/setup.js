/**
 * Stress Test — Setup: Tenant + User oluşturma
 */

const API_BASE = process.env.API_URL || 'http://localhost:3000';

async function api(method, path, body, token) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API_BASE + path, opts);
  return res.json();
}

async function getAdminToken() {
  const res = await api('POST', '/api/v1/auth/login', {
    username: 'admin',
    password: 'admin123'
  });
  if (!res.token) throw new Error('Admin login failed: ' + JSON.stringify(res));
  return res.token;
}

async function setupTenants(count, token) {
  const tenants = [];
  const existing = await api('GET', '/api/v1/auth/tenants', null, token);
  const existingCodes = new Set((existing.data || []).map(t => t.code));

  for (let i = 0; i < count; i++) {
    const letter = String.fromCharCode(65 + i); // A, B, C...
    const code = 'STRESS_' + letter;
    const domain = 'stress' + letter.toLowerCase() + '.test';

    if (existingCodes.has(code)) {
      const t = existing.data.find(t => t.code === code);
      tenants.push({ id: t.id, code: t.code, name: t.name, existed: true });
      continue;
    }

    const res = await api('POST', '/api/v1/auth/tenants', {
      name: 'Stress Test ' + letter,
      domain: domain,
      code: code
    }, token);

    if (res.error) {
      console.error('  Tenant create failed:', code, res.error);
      continue;
    }
    tenants.push({ id: res.tenant.id, code: res.tenant.code, name: res.tenant.name, existed: false });
  }
  return tenants;
}

async function applyWizard(tenantId, token) {
  const res = await api('POST', '/api/v1/config/wizard/apply', {
    tenant_id: tenantId,
    provider_code: 'ABC_LOG',
    sub_services: []
  }, token);
  return res;
}

async function setupUsers(tenants, usersPerTenant, token) {
  const allUsers = [];

  for (const tenant of tenants) {
    // Impersonate tenant
    const impRes = await api('POST', '/api/v1/auth/impersonate', {
      tenant_id: tenant.id
    }, token);
    const impToken = impRes.token || token;

    // Get existing users
    const existingUsers = await api('GET', '/api/v1/auth/users', null, impToken);
    const existingNames = new Set((existingUsers.data || []).map(u => u.username));

    const suffix = tenant.code.replace('STRESS_', '').toLowerCase();

    for (let j = 1; j <= usersPerTenant; j++) {
      const username = 'stress_' + suffix + '_' + String(j).padStart(2, '0');
      const password = 'test1234';

      if (existingNames.has(username)) {
        allUsers.push({ username, password, tenant_id: tenant.id, tenant_code: tenant.code, existed: true });
        continue;
      }

      const res = await api('POST', '/api/v1/auth/users', {
        username: username,
        password: password,
        display_name: 'Stress User ' + suffix.toUpperCase() + '-' + j,
        email: username + '@' + tenant.code.toLowerCase() + '.test',
        role: 'TENANT_USER',
        is_active: true
      }, impToken);

      if (res.error) {
        console.error('  User create failed:', username, res.error);
        continue;
      }
      allUsers.push({ username, password, tenant_id: tenant.id, tenant_code: tenant.code, existed: false });
    }

    // Stop impersonation
    await api('POST', '/api/v1/auth/impersonate/stop', {}, token);
  }

  return allUsers;
}

async function seedMaterials(tenants, token) {
  const MATERIALS = [
    { sap_material_no: 'MAT-001', description: 'Elektronik Komponent A', material_group: 'ELEC', base_uom: 'EA', gross_weight: 0.5, weight_unit: 'KG' },
    { sap_material_no: 'MAT-002', description: 'Metal Parça B', material_group: 'METAL', base_uom: 'EA', gross_weight: 2.3, weight_unit: 'KG' },
    { sap_material_no: 'MAT-003', description: 'Plastik Kasa C', material_group: 'PLAST', base_uom: 'EA', gross_weight: 1.1, weight_unit: 'KG' },
    { sap_material_no: 'MAT-004', description: 'Kimyasal Madde D', material_group: 'CHEM', base_uom: 'LT', gross_weight: 5.0, weight_unit: 'KG' },
    { sap_material_no: 'MAT-005', description: 'Ambalaj Malzemesi E', material_group: 'PACK', base_uom: 'EA', gross_weight: 0.2, weight_unit: 'KG' },
    { sap_material_no: 'MAT-006', description: 'Yedek Parca F', material_group: 'SPARE', base_uom: 'EA', gross_weight: 3.5, weight_unit: 'KG' },
    { sap_material_no: 'MAT-007', description: 'Hammadde G', material_group: 'RAW', base_uom: 'KG', gross_weight: 25.0, weight_unit: 'KG' },
    { sap_material_no: 'MAT-008', description: 'Baglanti Elemani H', material_group: 'CONN', base_uom: 'EA', gross_weight: 0.05, weight_unit: 'KG' },
    { sap_material_no: 'MAT-009', description: 'Kablo I', material_group: 'CABLE', base_uom: 'MT', gross_weight: 0.8, weight_unit: 'KG' },
    { sap_material_no: 'MAT-010', description: 'Boya J', material_group: 'PAINT', base_uom: 'LT', gross_weight: 4.0, weight_unit: 'KG' }
  ];

  let created = 0;
  let existed = 0;

  for (const tenant of tenants) {
    // Impersonate tenant
    const impRes = await api('POST', '/api/v1/auth/impersonate', { tenant_id: tenant.id }, token);
    const impToken = impRes.token || token;

    // Get existing materials
    const existing = await api('GET', '/api/master-data/materials', null, impToken);
    const existingNos = new Set((existing.data || []).map(m => m.sap_material_no));

    for (const mat of MATERIALS) {
      if (existingNos.has(mat.sap_material_no)) {
        existed++;
        continue;
      }
      const res = await api('POST', '/api/master-data/materials', mat, impToken);
      if (res.error) {
        console.error('  Material create failed:', tenant.code, mat.sap_material_no, res.error);
      } else {
        created++;
      }
    }

    // Stop impersonation
    await api('POST', '/api/v1/auth/impersonate/stop', {}, token);
  }

  return { created, existed };
}

async function cleanup(token) {
  const existing = await api('GET', '/api/v1/auth/tenants', null, token);
  const stressTenants = (existing.data || []).filter(t => t.code.startsWith('STRESS_'));

  for (const t of stressTenants) {
    const res = await api('DELETE', '/api/v1/auth/tenants/' + t.id, null, token);
    if (res.error) {
      console.error('  Delete failed:', t.code, res.error);
    } else {
      console.log('  Deleted:', t.code);
    }
  }
  return stressTenants.length;
}

module.exports = { getAdminToken, setupTenants, applyWizard, setupUsers, seedMaterials, cleanup, api };
