const SERVICE_ID_RE = /^[a-z0-9_-]{1,64}$/;

function parseDateRange(fromRaw, toRaw) {
  const from = fromRaw ? new Date(fromRaw) : new Date('1970-01-01T00:00:00Z');
  if (fromRaw && Number.isNaN(from.getTime())) {
    return { error: `Invalid 'from' date: ${fromRaw}` };
  }

  let to;
  if (toRaw) {
    to = new Date(toRaw);
    if (Number.isNaN(to.getTime())) return { error: `Invalid 'to' date: ${toRaw}` };
    if (/^\d{4}-\d{2}-\d{2}$/.test(toRaw)) {
      to = new Date(to.getTime() + 24 * 60 * 60 * 1000);
    }
  } else {
    to = new Date('2100-01-01T00:00:00Z');
  }

  if (from >= to) {
    return { error: `'from' (${from.toISOString()}) mustt be before 'to' (${to.toISOString()})` };
  }

  return { from: from.toISOString(), to: to.toISOString() };
}

function parseServiceId(raw) {
  if (!raw || raw === 'all') return { serviceId: null };
  const v = String(raw).trim().toLowerCase();
  if (!SERVICE_ID_RE.test(v)) return { error: `Invalid serviceId: ${raw}` };
  return { serviceId: v };
}

function parsePagination(pageRaw, pageSizeRaw) {
  let page = parseInt(pageRaw, 10);
  let pageSize = parseInt(pageSizeRaw, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = 50;
  if (pageSize > 500) pageSize = 500; 
  return { page, pageSize };
}

module.exports = { parseDateRange, parseServiceId, parsePagination };
