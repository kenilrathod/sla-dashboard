'use strict';
const express = require('express');
const { pool } = require('../db');
const { parseDateRange, parseServiceId } = require('./filters');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { from, to, error: rangeError } = parseDateRange(req.query.from, req.query.to);
    if (rangeError) return res.status(400).json({ error: rangeError });

    const { serviceId, error: serviceError } = parseServiceId(req.query.serviceId);
    if (serviceError) return res.status(400).json({ error: serviceError });

    const params = [from, to];
    let serviceFilter = '';
    if (serviceId) {
      params.push(serviceId);
      serviceFilter = ` AND service_id = $${params.length}`;
    }

    console.log(params)
    const overallQuery = pool.query(
      `
      SELECT
        COUNT(*)::int AS total_checks,
        COUNT(*) FILTER (WHERE is_success)::int AS success_checks,
        COUNT(*) FILTER (WHERE NOT is_success)::int AS failed_checks,
        COUNT(*) FILTER (WHERE NOT is_valid_http_status)::int AS anomalous_status_checks,
        COUNT(*) FILTER (WHERE latency_missing)::int AS latency_missing_checks,
        COUNT(*) FILTER (WHERE latency_invalid)::int AS latency_invalid_checks,
        percentile_cont(0.50) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE latency_ms IS NOT NULL) AS p50_latency_ms,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE latency_ms IS NOT NULL) AS p95_latency_ms,
        percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE latency_ms IS NOT NULL) AS p99_latency_ms,
        AVG(latency_ms) FILTER (WHERE latency_ms IS NOT NULL) AS avg_latency_ms
      FROM checks
      WHERE ts >= $1 AND ts < $2 ${serviceFilter}
      `,
      params
    );

    const byServiceQuery = pool.query(
      `
      SELECT
        service_id,
        MAX(service_name) AS service_name,
        COUNT(*)::int AS total_checks,
        COUNT(*) FILTER (WHERE is_success)::int AS success_checks,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE latency_ms IS NOT NULL) AS p95_latency_ms
      FROM checks
      WHERE ts >= $1 AND ts < $2 ${serviceFilter}
      GROUP BY service_id
      ORDER BY service_id
      `,
      params
    );

    const byStatusClassQuery = pool.query(
      `
      SELECT
        CASE
          WHEN NOT is_valid_http_status THEN 'invalid'
          WHEN status_code BETWEEN 200 AND 299 THEN '2xx'
          WHEN status_code BETWEEN 300 AND 399 THEN '3xx'
          WHEN status_code BETWEEN 400 AND 499 THEN '4xx'
          WHEN status_code BETWEEN 500 AND 599 THEN '5xx'
          ELSE 'unknown'
        END AS status_class,
        COUNT(*)::int AS count
      FROM checks
      WHERE ts >= $1 AND ts < $2 ${serviceFilter}
      GROUP BY 1
      ORDER BY 1
      `,
      params
    );

    const recentFailuresQuery = pool.query(
      `
      SELECT service_id, service_name, ts, status_code_raw, agent, region
      FROM checks
      WHERE ts >= $1 AND ts < $2 AND NOT is_success ${serviceFilter}
      ORDER BY ts DESC
      LIMIT 10
      `,
      params
    );

    const [overall, byService, byStatusClass, recentFailures] = await Promise.all([
      overallQuery, byServiceQuery, byStatusClassQuery, recentFailuresQuery,
    ]);

    const o = overall.rows[0];
    console.log(o)
    const uptimePercent = o.total_checks > 0 ? (o.success_checks / o.total_checks) * 100 : null;

    res.json({
      range: { from, to },
      overall: {
        totalChecks: o.total_checks,
        successChecks: o.success_checks,
        failedChecks: o.failed_checks,
        anomalousStatusChecks: o.anomalous_status_checks,
        latencyMissingChecks: o.latency_missing_checks,
        latencyInvalidChecks: o.latency_invalid_checks,
        uptimePercent,
        p50LatencyMs: numOrNull(o.p50_latency_ms),
        p95LatencyMs: numOrNull(o.p95_latency_ms),
        p99LatencyMs: numOrNull(o.p99_latency_ms),
        avgLatencyMs: numOrNull(o.avg_latency_ms),
      },
      byService: byService.rows.map((r) => ({
        serviceId: r.service_id,
        serviceName: r.service_name,
        totalChecks: r.total_checks,
        successChecks: r.success_checks,
        uptimePercent: r.total_checks > 0 ? (r.success_checks / r.total_checks) * 100 : null,
        p95LatencyMs: numOrNull(r.p95_latency_ms),
      })),
      byStatusClass: byStatusClass.rows,
      recentFailures: recentFailures.rows,
    });
  } catch (err) {
    console.error('GET /api/stats error', err);
    res.status(500).json({ error: 'Failed to compute stats.' });
  }
});

function numOrNull(v) {
  return v === null || v === undefined ? null : Math.round(Number(v) * 100) / 100;
}

module.exports = router;
