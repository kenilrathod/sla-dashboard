import { useEffect, useState } from 'react';
import { getLogs } from '../api';

const PAGE_SIZE = 50;

export default function LogsTable({ serviceId, agents }) {
  const [mode, setMode] = useState('range'); // 'single' | 'range'
  const [date, setDate] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('all');
  const [agent, setAgent] = useState('all');
  const [page, setPage] = useState(1);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => { setPage(1); }, [serviceId, mode, date, from, to, status, agent]);

  useEffect(() => {
    console.log(data)
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = { serviceId, status, agent, page, pageSize: PAGE_SIZE };
    if (mode === 'single' && date) params.date = date;
    if (mode === 'range') {
      if (from) params.from = from;
      if (to) params.to = to;
    }

    getLogs(params)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [serviceId, mode, date, from, to, status, agent, page]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <section className="logs-section">
      <h2>Check logs</h2>

      <div className="logs-filters">
        <div className="filter-group">
          <label>
            <input type="radio" checked={mode === 'range'} onChange={() => setMode('range')} /> Date range
          </label>
          <label>
            <input type="radio" checked={mode === 'single'} onChange={() => setMode('single')} /> Single date
          </label>
        </div>

        {mode === 'range' ? (
          <div className="filter-group">
            <label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
        ) : (
          <div className="filter-group">
            <label>Date <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          </div>
        )}

        <div className="filter-group">
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All</option>
              <option value="success">Success (2xx/3xx)</option>
              <option value="failed">Failed</option>
              <option value="anomalous">Anomalous status code</option>
            </select>
          </label>
          <label>
            Agent
            <select value={agent} onChange={(e) => setAgent(e.target.value)}>
              <option value="all">All</option>
              {(agents || []).map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Service</th>
              <th>Status</th>
              <th>Latency</th>
              <th>Agent</th>
              <th>Region</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="muted">Loading…</td></tr>
            )}
            {!loading && data && data.rows.length === 0 && (
              <tr><td colSpan={6} className="muted">No checks match these filters.</td></tr>
            )}
            {!loading && data && data.rows.map((r, i) => (
              <tr key={i} className={r.is_success ? '' : 'row-failed'}>
                <td>{new Date(r.ts).toISOString().replace('T', ' ').replace('.000Z', ' UTC')}</td>
                <td>{r.service_name}</td>
                <td>
                  {r.status_code_raw}
                  {!r.is_valid_http_status && <span className="badge badge-anomalous">anomalous</span>}
                </td>
                <td>
                  {r.latency_ms !== null ? `${Math.round(r.latency_ms)}ms` : (
                    <span className="muted">{r.latency_invalid ? 'invalid' : 'missing'}</span>
                  )}
                </td>
                <td>{r.agent}</td>
                <td>{r.region}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && (
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
          <span>Page {page} of {totalPages} · {data.total.toLocaleString()} rows</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      )}
    </section>
  );
}
