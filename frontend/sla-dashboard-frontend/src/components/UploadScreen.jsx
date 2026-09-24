import { useCallback, useRef, useState } from 'react';

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50MB

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

    </div>
  );
}

export default UploadScreen
