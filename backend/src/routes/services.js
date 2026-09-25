'use strict';
const express = require('express');
const { pool } = require('../db');

const router = express.Router();

router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT service_id, MAX(service_name) AS service_name, COUNT(*)::int AS total_checks
       FROM checks GROUP BY service_id ORDER BY service_id`
    );
    res.json({ services: rows });
  } catch (err) {
    console.error('GET /api/services error', err);
    res.status(500).json({ error: 'Failed to fetch services.' });
  }
});

router.get('/agents', async (_req, res) => {
  try {
    const { rows } = await pool.query(`SELECT DISTINCT agent FROM checks ORDER BY agent`);
    res.json({ agents: rows.map((r) => r.agent) });
  } catch (err) {
    console.error('GET /api/services/agents error', err);
    res.status(500).json({ error: 'Failed to fetch agents.' });
  }
});

module.exports = router;
