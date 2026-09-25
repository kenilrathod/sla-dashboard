import { useCallback, useRef, useState } from 'react';
import { requestPresignedUpload, putFileToS3, getUploadStatus } from '../api';
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50MB
const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 2 * 60 * 1000

function UploadScreen({ onDone }) {
  const [phase, setPhase] = useState('idle')
  const [error, setError] = useState(null)
  const [summary, setSummary] = useState(null)
  const [fileName, setFileName] = useState(null);
  const inputRef = useRef(null);

  const reset = () => {
    setPhase('idle');
    setError(null);
    setSummary(null);
    setFileName(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleFile = useCallback(async (file) => {
    setError(null);
    setSummary(null);

    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please choose a .csv file.');
      return;
    }
    if (file.size === 0) {
      setError('That file is empty!');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max is 50MB.`);
      return;
    }

    setFileName(file.name);
    setPhase('uploading');

    //API Call
    try {
      const { uploadUrl, uploadRunId } = await requestPresignedUpload(file.name);
      await putFileToS3(uploadUrl, file);
      setPhase('processing');

      const result = await pollUntilDone(uploadRunId);
      if (result.status === 'failed') {
        setError(result.error_message || 'Processing failed.');
        setPhase('error');
        return;
      }
      setSummary(result);      
      setPhase('done');
    } catch (err) {
      setError(err.message || 'Something went wrong.');
      setPhase('error');
    }

  }, []);

  return (
    <div className="upload-screen">
      <h1>SLA Monitoring Dashboard</h1>
      <p className="subtitle">Upload a health-check CSV to parse, validate, and load it.</p>

      {phase === 'idle' || phase === 'error' ? (
        <div
          className="dropzone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFile(e.dataTransfer.files?.[0]);
          }}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <p>Click to choose a CSV, or drag one here</p>
          {error && <p className="error-text">{error}</p>}
        </div>
      ) : null}

      {(phase === 'uploading' || phase === 'processing') && (
        <div className="status-card">
          <div className="spinner" aria-hidden />
          <p>
            {phase === 'uploading' ? `Uploading ${fileName}…` : `Parsing and validating ${fileName}…`}
          </p>
        </div>
      )}

      {phase === 'done' && summary && (
        <div className="status-card success">
          <h2>Upload complete</h2>
          <ul className="summary-list">
            <li><strong>{summary.total_rows}</strong> rows read</li>
            <li><strong>{summary.inserted_rows}</strong> loaded</li>
            <li><strong>{summary.duplicate_rows}</strong> exact duplicates dropped</li>
            <li><strong>{summary.conflicting_rows}</strong> conflicting duplicates resolved</li>
            <li><strong>{summary.rejected_rows}</strong> rows rejected</li>
          </ul>
          {summary.rejected_rows > 0 && (
            <details className="rejected-reasons">
              <summary>Why rows were rejected</summary>
              <pre>{JSON.stringify(summary.rejected_reasons, null, 2)}</pre>
            </details>
          )}
          <div className="button-row">
            <button onClick={() => onDone(summary)}>View dashboard →</button>
            <button className="secondary" onClick={reset}>Upload another file</button>
          </div>
        </div>
      )}

      {phase === 'error' && error && (
        <div className="status-card error">
          <p className="error-text">{error}</p>
          <button onClick={reset}>Try again</button>
        </div>
      )}

    </div>
  );
}

export default UploadScreen

export async function pollUntilDone(uploadRunId) {
  const start = Date.now()
  while(Date.now() - start < POLL_TIMEOUT_MS) {
    const status = await getUploadStatus(uploadRunId)
    if( status.status == "completed" || status.status == "failed") return status
    await delay(POLL_INTERVAL_MS)
  }
  throw new Error('Processing is taking longer than expected. Check back on the dashboard shortly.');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve,ms))
}
