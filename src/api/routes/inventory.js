const express = require('express');
const router = express.Router();
const JsonStore = require('../../shared/jsonStore');

const mappingStore = new JsonStore('movement_mappings.json');

// GET /api/inventory/mappings - List movement mappings
router.get('/mappings', (req, res) => {
  const data = mappingStore.readAll().filter(m => m.is_active);
  res.json({ data });
});

module.exports = router;
