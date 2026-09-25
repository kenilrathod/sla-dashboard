const API_ENDPOINT = import.meta.env.VITE_UPLOAD_API_URL || 'http://localhost:4000';

async function asJson(res) {
  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const errMessage = body?.error || `Request failed with ${res.status}`;
    throw new Error(errMessage);
  }
  console.log(body)
  return body;
}

export async function requestPresignedUpload(filename) {
  const res = await fetch(`${API_ENDPOINT}/uploads/presign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename }),
  });
  return asJson(res);
}

export async function putFileToS3(uploadUrl, file) {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/csv' },
    body: file,
  });
  if (!res.ok) {
    throw new Error(`Upload to storage failed (HTTP ${res.status}). Please retry.`);
  }
}

export async function getUploadStatus(uploadRunId) {
  const status = await fetch(`${API_ENDPOINT}/uploads/${uploadRunId}/status`)
  return asJson(status);
}

export async function getStats({ serviceId, from, to } = {}) {
  const params = new URLSearchParams();
  if (serviceId && serviceId !== 'all') params.set('serviceId', serviceId);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const res = await fetch(`${API_ENDPOINT}/api/stats?${params.toString()}`);
  return asJson(res);
}

export async function getLogs({ serviceId, date, from, to, status, agent, page, pageSize } = {}) {
  const params = new URLSearchParams();
  if (serviceId && serviceId !== 'all') params.set('serviceId', serviceId);
  if (date) params.set('date', date);
  if (!date && from) params.set('from', from);
  if (!date && to) params.set('to', to);
  if (status && status !== 'all') params.set('status', status);
  if (agent && agent !== 'all') params.set('agent', agent);
  if (page) params.set('page', page);
  if (pageSize) params.set('pageSize', pageSize);
  const res = await fetch(`${API_ENDPOINT}/api/logs?${params.toString()}`);
  return asJson(res);
}

export async function getServices() {
  const res = await fetch(`${API_ENDPOINT}/api/services`);
  return asJson(res);
}

export async function getAgents() {
  const res = await fetch(`${API_ENDPOINT}/api/services/agents`);
  return asJson(res);
}