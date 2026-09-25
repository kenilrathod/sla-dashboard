const {S3Client, GetObjectCommand} = require('@aws-sdk/client-s3')
const {cleanRows} = require("./clean")
const { parse } = require('csv-parse/sync');
const { pool } = require('./db');

const s3Client = new S3Client({
    endpoint:"http://host.docker.internal:4566",
    credentials:{
        secretAccessKey:"text",
        accessKeyId:"text"
    },
    forcePathStyle:true,

})

const BATCH_SIZE = 500

exports.handler = async (event) => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    await processOne(bucket, key);
  }
};

async function processOne(bucket, key) {
  const uploadRunId = key.split('/')[1];

  try {
    await pool.query(`UPDATE upload_runs SET status = 'processing', updated_at = now() WHERE id = $1`,
        [uploadRunId]
    );

    const obj = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const csvText = await streamToString(obj.Body);

    let records;
    try {
      records = parse(csvText, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });
    } catch (parseErr) {
      console.error("Parsing error",parseErr)
      await pool.query(
        `UPDATE upload_runs
         SET status = 'failed', error_message = $2, updated_at = now()
         WHERE id = $1`,
        [uploadRunId, `CSV parse failed: ${parseErr.message}`]
      );
      return;
    }

    if (records.length === 0) {
      await pool.query(
        `UPDATE upload_runs
         SET status = 'failed', error_message = 'File contained no data rows.', updated_at = now()
         WHERE id = $1`,
        [uploadRunId]
      );
      return;
    }

    const required = ['service_id', 'service_name', 'timestamp', 'status_code', 'latency', 'latency_unit', 'agent', 'region'];
    const headers = Object.keys(records[0]);
    const missingCols = required.filter((c) => !headers.includes(c));
    if (missingCols.length) {
      await pool.query(
        `UPDATE upload_runs
         SET status = 'failed', error_message = $2, updated_at = now()
         WHERE id = $1`,
        [uploadRunId, `Missing required column(s): ${missingCols.join(', ')}`]
      );
      return;
    }

    const cleaned = cleanRows(records);

    let insertedCount = 0;
    let minTs = null;
    let maxTs = null;

    for (let i = 0; i < cleaned.accepted.length; i += BATCH_SIZE) {
      const batch = cleaned.accepted.slice(i, i + BATCH_SIZE);
      const inserted = await insertBatch(pool, batch, uploadRunId);
      insertedCount += inserted;
      for (const r of batch) {
        if (!minTs || r.ts < minTs) minTs = r.ts;
        if (!maxTs || r.ts > maxTs) maxTs = r.ts;
      }
    }

    await pool.query(
      `UPDATE upload_runs SET
         status = 'completed',
         total_rows = $2,
         inserted_rows = $3,
         duplicate_rows = $4,
         conflicting_rows = $5,
         rejected_rows = $6,
         rejected_reasons = $7,
         min_ts = $8,
         max_ts = $9,
         updated_at = now()
       WHERE id = $1`,
      [
        uploadRunId,
        records.length,
        insertedCount,
        cleaned.duplicate_rows,
        cleaned.conflicting_rows,
        cleaned.rejected_rows,
        JSON.stringify(cleaned.rejected_reasons),
        minTs,
        maxTs,
      ]
    );
  } catch (err) {
    console.error('process-upload error', err);
    try {
      await pool.query(
        `UPDATE upload_runs SET status = 'failed', error_message = $2, updated_at = now() WHERE id = $1`,
        [uploadRunId, String(err.message || err).slice(0, 500)]
      );
    } catch (updateErr) {
      console.error('failed to record failure state', updateErr);
    }
  }
}

function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

async function insertBatch(pool, batch, uploadRunId) {
  if (batch.length === 0) return 0;

  const cols = [
    'service_id', 'service_name', 'ts', 'status_code_raw', 'status_code',
    'is_valid_http_status', 'is_success', 'latency_ms', 'latency_missing',
    'latency_invalid', 'agent', 'region', 'source_row_number', 'upload_run_id',
  ];

  const values = [];
  const placeholders = batch
    .map((r, i) => {
      const base = i * cols.length;
      values.push(
        r.service_id, r.service_name, r.ts, r.status_code_raw, r.status_code,
        r.is_valid_http_status, r.is_success, r.latency_ms, r.latency_missing,
        r.latency_invalid, r.agent, r.region, r.source_row_number, uploadRunId
      );
      return `(${cols.map((_, j) => `$${base + j + 1}`).join(',')})`;
    })
    .join(',');

  const sql = `
    INSERT INTO checks (${cols.join(',')})
    VALUES ${placeholders}
    ON CONFLICT (service_id, ts, agent) DO NOTHING
  `;

  const result = await pool.query(sql, values);
  return result.rowCount;
}