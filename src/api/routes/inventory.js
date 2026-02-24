const express = require('express');
const router = express.Router();
const DbStore = require('../../shared/database/dbStore');

const mappingStore = new DbStore('movement_mappings');

// GET /api/inventory/mappings - List movement mappings
router.get('/mappings', async (req, res) => {
  const data = (await mappingStore.readAll()).filter(m => m.is_active);
  res.json({ data });
});

module.exports = router;
