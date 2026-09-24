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