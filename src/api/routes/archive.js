const express = require('express');
const router = express.Router();
const { query } = require('../../shared/database/pool');
const { tenantFilter } = require('../../shared/middleware/auth');
const logger = require('../../shared/utils/logger');
const { validate } = require('../../shared/validators/middleware');
const { z } = require('zod');

// Arsiv arama schemasi — gelismis kriterler
const ArchiveSearchSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  // Metin arama (teslimat no, musteri, adres, notlar)
  search: z.string().max(200).optional(),
  // Durum filtresi
  status: z.string().max(30).optional(),
  // Teslimat tipi (LF, NL, EL, RL, UL)
  delivery_type: z.string().max(10).optional(),
  // Yon (INBOUND / OUTBOUND)
  order_type: z.enum(['INBOUND', 'OUTBOUND']).optional(),
  // Surec tipi
  process_type: z.string().max(30).optional(),
  // Depo kodu
  warehouse_code: z.string().max(20).optional(),
  // Uretim yeri (WERKS)
  plant_code: z.string().max(10).optional(),
  // Hareket tipi
  mvt_type: z.string().max(10).optional(),
  // Oncelik
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
  // Tarih araliklari
  archived_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  archived_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  received_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  received_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  completed_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  completed_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // Siralama
  sort: z.string().max(30).optional(),
  order: z.enum(['ASC', 'DESC']).optional()
}).passthrough();

/* ═══════════════════════════════════════════
   GET /api/archive — Arsivlenmis is emirleri (read-only, gelismis arama)
   ═══════════════════════════════════════════ */
router.get('/', validate(ArchiveSearchSchema, 'query'), async (req, res) => {
  try {
    const {
      limit, offset, search, status, delivery_type, order_type,
      process_type, warehouse_code, plant_code, mvt_type, priority,
      archived_from, archived_to, received_from, received_to,
      completed_from, completed_to, sort, order
    } = req.query;

    const tenantId = req.tenantId || (req.user && req.user.tenant_id) || null;

    const conditions = ['archived_at IS NOT NULL'];
    const params = [];
    let paramIdx = 0;

    // Tenant filtresi
    if (tenantId) {
      paramIdx++;
      conditions.push('tenant_id = $' + paramIdx);
      params.push(tenantId);
    }

    // Durum
    if (status) {
      paramIdx++;
      conditions.push('status = $' + paramIdx);
      params.push(status);
    }

    // Teslimat tipi
    if (delivery_type) {
      paramIdx++;
      conditions.push('sap_delivery_type = $' + paramIdx);
      params.push(delivery_type);
    }

    // Yon
    if (order_type) {
      paramIdx++;
      conditions.push('order_type = $' + paramIdx);
      params.push(order_type);
    }

    // Surec tipi
    if (process_type) {
      paramIdx++;
      conditions.push('process_type = $' + paramIdx);
      params.push(process_type);
    }

    // Depo kodu
    if (warehouse_code) {
      paramIdx++;
      conditions.push('warehouse_code = $' + paramIdx);
      params.push(warehouse_code);
    }

    // Uretim yeri
    if (plant_code) {
      paramIdx++;
      conditions.push('plant_code = $' + paramIdx);
      params.push(plant_code);
    }

    // Hareket tipi — work_orders tablosunda mvt_type kolonu yok, filtre devre disi

    // Oncelik
    if (priority) {
      paramIdx++;
      conditions.push('priority = $' + paramIdx);
      params.push(priority);
    }

    // Metin arama (ILIKE ile birden fazla alandan arar)
    if (search) {
      paramIdx++;
      const searchParam = '%' + search + '%';
      conditions.push(
        '(sap_delivery_no ILIKE $' + paramIdx +
        ' OR notes ILIKE $' + paramIdx +
        ' OR sap_ship_to ILIKE $' + paramIdx +
        ' OR warehouse_code ILIKE $' + paramIdx + ')'
      );
      params.push(searchParam);
    }

    // Arsiv tarihi araligi
    if (archived_from) {
      paramIdx++;
      conditions.push('archived_at >= $' + paramIdx + '::date');
      params.push(archived_from);
    }
    if (archived_to) {
      paramIdx++;
      conditions.push('archived_at < ($' + paramIdx + '::date + 1)');
      params.push(archived_to);
    }

    // Alinma tarihi araligi
    if (received_from) {
      paramIdx++;
      conditions.push('received_at >= $' + paramIdx + '::date');
      params.push(received_from);
    }
    if (received_to) {
      paramIdx++;
      conditions.push('received_at < ($' + paramIdx + '::date + 1)');
      params.push(received_to);
    }

    // Tamamlanma tarihi araligi
    if (completed_from) {
      paramIdx++;
      conditions.push('completed_at >= $' + paramIdx + '::date');
      params.push(completed_from);
    }
    if (completed_to) {
      paramIdx++;
      conditions.push('completed_at < ($' + paramIdx + '::date + 1)');
      params.push(completed_to);
    }

    const whereClause = conditions.join(' AND ');

    // Siralama — izin verilen kolonlar
    const ALLOWED_SORT = [
      'archived_at', 'received_at', 'completed_at', 'sap_posted_at',
      'sap_delivery_no', 'status', 'warehouse_code', 'order_type',
      'process_type', 'priority', 'plant_code'
    ];
    const sortCol = ALLOWED_SORT.includes(sort) ? sort : 'archived_at';
    const sortDir = order === 'ASC' ? 'ASC' : 'DESC';

    // Count
    const countResult = await query(
      'SELECT count(*)::int AS total FROM work_orders WHERE ' + whereClause,
      params
    );
    const total = countResult.rows[0].total;

    // Data — buyuk alanlari haric tut (performans)
    paramIdx++;
    const limitParam = paramIdx;
    params.push(limit);
    paramIdx++;
    const offsetParam = paramIdx;
    params.push(offset);

    const dataResult = await query(
      `SELECT id, tenant_id, sap_delivery_no, sap_delivery_type, order_type,
              status, warehouse_code, plant_code, sap_ship_to,
              process_type, priority, notes,
              received_at, sent_to_wms_at, completed_at, sap_posted_at, archived_at,
              created_at,
              jsonb_array_length(COALESCE(lines, '[]'::jsonb)) AS line_count
       FROM work_orders
       WHERE ${whereClause}
       ORDER BY "${sortCol}" ${sortDir}
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params
    );

    // Tarih formatlama
    const data = dataResult.rows.map(o => {
      o.received_at_fmt = o.received_at ? new Date(o.received_at).toLocaleString('tr-TR') : '';
      o.completed_at_fmt = o.completed_at ? new Date(o.completed_at).toLocaleString('tr-TR') : '';
      o.archived_at_fmt = o.archived_at ? new Date(o.archived_at).toLocaleString('tr-TR') : '';
      o.sap_posted_at_fmt = o.sap_posted_at ? new Date(o.sap_posted_at).toLocaleString('tr-TR') : '';
      return o;
    });

    res.json({ data, total, limit, offset });
  } catch (err) {
    logger.error('GET /api/archive error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════
   GET /api/archive/:id — Arsiv detayi (read-only)
   ═══════════════════════════════════════════ */
router.get('/:id', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM work_orders WHERE id = $1 AND archived_at IS NOT NULL',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Arsiv kaydi bulunamadi' });
    }
    res.json({ data: result.rows[0] });
  } catch (err) {
    logger.error('GET /api/archive/:id error', { error: err.message, id: req.params.id });
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════
   GET /api/archive/stats — Arsiv istatistikleri
   ═══════════════════════════════════════════ */
router.get('/stats', async (req, res) => {
  try {
    const tenantId = req.tenantId || (req.user && req.user.tenant_id) || null;
    const tenantWhere = tenantId ? ' AND tenant_id = $1' : '';
    const tenantParams = tenantId ? [tenantId] : [];

    const result = await query(
      `SELECT
         count(*)::int AS total,
         count(*) FILTER (WHERE status = 'PGI_POSTED')::int AS pgi_count,
         count(*) FILTER (WHERE status = 'GR_POSTED')::int AS gr_count,
         count(*) FILTER (WHERE status = 'COMPLETED')::int AS completed_count,
         count(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled_count,
         min(archived_at) AS oldest,
         max(archived_at) AS newest
       FROM work_orders
       WHERE archived_at IS NOT NULL${tenantWhere}`,
      tenantParams
    );

    res.json({ data: result.rows[0] });
  } catch (err) {
    logger.error('GET /api/archive/stats error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
