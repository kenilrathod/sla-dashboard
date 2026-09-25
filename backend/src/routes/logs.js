const express = require('express');
const { pool } = require('../db');
const { parseDateRange, parseServiceId, parsePagination } = require('./filters');

const router = express.Router();

const STATUS_FILTERS = new Set(['all', 'success', 'failed', 'anomalous']);


router.get('/', async (req, res) => {
  try {
    const dateParam = req.query.date;
    const { from, to, error: rangeError } = parseDateRange(
      dateParam || req.query.from,
      dateParam || req.query.to
    );
    console.log(from,to)
    if (rangeError) return res.status(400).json({ error: rangeError });

    const { serviceId, error: serviceError } = parseServiceId(req.query.serviceId);
    if (serviceError) return res.status(400).json({ error: serviceError });

    const status = req.query.status || 'all';
    if (!STATUS_FILTERS.has(status)) {
      return res.status(400).json({ error: `Invalid status filter: ${status}` });
    }

    const agent = req.query.agent ? String(req.query.agent).trim() : null;
    if (agent && !/^[a-zA-Z0-9_-]{1,64}$/.test(agent)) {
      return res.status(400).json({ error: `Invalid agent: ${agent}` });
    }

    const { page, pageSize } = parsePagination(req.query.page, req.query.pageSize);

    const where = ['ts >= $1', 'ts < $2'];
    const params = [from, to];

    if (serviceId) {
      params.push(serviceId);
      where.push(`service_id = $${params.length}`);
    }
    if (agent) {
      params.push(agent);
      where.push(`agent = $${params.length}`);
    }
    if (status === 'success') where.push('is_success');
    if (status === 'failed') where.push('NOT is_success');
    if (status === 'anomalous') where.push('NOT is_valid_http_status');

    const whereSql = where.join(' AND ');

    params.push(pageSize);
    const limitIdx = params.length;
    params.push((page - 1) * pageSize);
    const offsetIdx = params.length;

    const [rowsResult, countResult] = await Promise.all([
      pool.query(
        `
        SELECT service_id, service_name, ts, status_code_raw, is_valid_http_status,
               is_success, latency_ms, latency_missing, latency_invalid, agent, region
        FROM checks
        WHERE ${whereSql}
        ORDER BY ts ASC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
        `,
        params
      ),
      pool.query(`SELECT COUNT(*)::int AS total FROM checks WHERE ${whereSql}`, params.slice(0, -2)),
    ]);
    console.log(rowsResult.rows)
    console.log(rowsResult.rows.length)
    res.json({
      range: { from, to },
      page,
      pageSize,
      total: countResult.rows[0].total,
      rows: rowsResult.rows,
    });
  } catch (err) {
    console.error('GET /api/logs error', err);
    res.status(500).json({ error: 'Failed to fetch logs.' });
  }
});

module.exports = router;
