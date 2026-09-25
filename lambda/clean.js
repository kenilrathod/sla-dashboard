const VALID_LATENCY_UNITS = new Set(['ms', 's']);

function isBlank(v) {
  return v === undefined || v === null || String(v).trim() === '';
}

function parseTimestamp(raw) {
  if (isBlank(raw)) return null;
  const s = String(raw).trim();

  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    const ms = s.length >= 13 ? n : n * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeLatency(rawLatency, rawUnit) {
  const unit = (rawUnit || '').trim().toLowerCase();

  if (isBlank(rawLatency)) {
    return { latency_ms: null, latency_missing: true, latency_invalid: false };
  }

  const n = Number(rawLatency);
  if (!Number.isFinite(n)) {
    return { latency_ms: null, latency_missing: true, latency_invalid: true };
  }

  if (!VALID_LATENCY_UNITS.has(unit)) {
    // Invalid unit 
    return { latency_ms: null, latency_missing: false, latency_invalid: true };
  }

  const ms = unit === 's' ? n * 1000 : n;

  if (ms < 0) {
    return { latency_ms: null, latency_missing: false, latency_invalid: true };
  }

  return { latency_ms: ms, latency_missing: false, latency_invalid: false };
}

function classifyStatus(rawStatus) {
  const s = String(rawStatus ?? '').trim();
  const n = Number(s);
  const isInt = Number.isInteger(n);
  const isValidHttp = isInt && n >= 100 && n <= 599;
  const isSuccess = isValidHttp && n >= 200 && n < 500;
  return {
    status_code_raw: s,
    status_code: isInt ? n : null,
    is_valid_http_status: isValidHttp,
    is_success: isSuccess,
  };
}

//
function cleanRow(raw, rowNumber) {
  const service_id = (raw.service_id || '').trim();
  const service_name = (raw.service_name || '').trim();
  const agent = (raw.agent || '').trim();
  const region = (raw.region || '').trim();

  if (isBlank(service_id)) return { ok: false, reason: 'missing_service_id' };
  if (isBlank(service_name)) return { ok: false, reason: 'missing_service_name' };
  if (isBlank(agent)) return { ok: false, reason: 'missing_agent' };
  if (isBlank(region)) return { ok: false, reason: 'missing_region' };
  if (isBlank(raw.status_code)) return { ok: false, reason: 'missing_status_code' };

  const ts = parseTimestamp(raw.timestamp);
  if (!ts) return { ok: false, reason: 'bad_timestamp' };

  const { status_code_raw, status_code, is_valid_http_status, is_success } =
    classifyStatus(raw.status_code);

  const { latency_ms, latency_missing, latency_invalid } = normalizeLatency(
    raw.latency,
    raw.latency_unit
  );

  return {
    ok: true,
    row: {
      service_id: service_id.toLowerCase(),
      service_name,
      ts: ts.toISOString(),
      status_code_raw,
      status_code,
      is_valid_http_status,
      is_success,
      latency_ms,
      latency_missing,
      latency_invalid,
      agent,
      region,
      source_row_number: rowNumber,
    },
  };
}

function cleanRows(records) {
  const accepted = [];
  const rejected_reasons = {};
  let duplicate_rows = 0;
  let conflicting_rows = 0;

  const seenExact = new Set(); 
  const seenKey = new Map();

  records.forEach((raw, idx) => {
    const rowNumber = idx + 2;
    const result = cleanRow(raw, rowNumber);

    if (!result.ok) {
      rejected_reasons[result.reason] = (rejected_reasons[result.reason] || 0) + 1;
      return;
    }

    const r = result.row;
    const naturalKey = `${r.service_id}___${r.service_name}__${r.ts}__${r.agent}__${r.region}`;
    const { source_row_number, ...contentOnly } = r;
    const fullFingerprint = JSON.stringify(contentOnly);

    if (seenExact.has(fullFingerprint)) {
      duplicate_rows += 1;
      return;
    }
    seenExact.add(fullFingerprint);

    if (seenKey.has(naturalKey)) {
      conflicting_rows += 1;
      return;
    }
    seenKey.set(naturalKey, fullFingerprint);

    accepted.push(r);
  });

  return {
    accepted,
    duplicate_rows,
    conflicting_rows,
    rejected_rows: Object.values(rejected_reasons).reduce((a, b) => a + b, 0),
    rejected_reasons,
  };
}

module.exports = { cleanRow, cleanRows, parseTimestamp, normalizeLatency, classifyStatus };
