const express = require('express');
const router = express.Router();
const DbStore = require('../../shared/database/dbStore');
const logger = require('../../shared/utils/logger');

const mappingStore = new DbStore('movement_mappings');

// GET /api/inventory/mappings - List movement mappings
router.get('/mappings', async (req, res) => {
  try {
    const data = (await mappingStore.readAll()).filter(m => m.is_active);
    res.json({ data });
  } catch (err) {
    logger.error('GET /api/inventory/mappings error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
