import { useEffect, useState } from 'react';
import { getStats } from '../api';

export default function StatsSection({ serviceId, from, to }) {
  const [expanded, setExpanded] = useState(true);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getStats({ serviceId, from, to })
      .then((data) => { if (!cancelled) setStats(data); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [serviceId, from, to]);

  return (
    <section className="stats-section">
      <button className="section-toggle" onClick={() => setExpanded((v) => !v)}>
        <span>{expanded ? '▾' : '▸'} Stats</span>
        {stats && !loading && (
          <span className="uptime-pill">
            {fmtPercent(stats.overall.uptimePercent)} uptime · {stats.overall.totalChecks.toLocaleString()} checks
          </span>
        )}
      </button>

      {expanded && (
        <div className="stats-body">
          {loading && <p className="muted">Loading stats…</p>}
          {error && <p className="error-text">{error}</p>}
          {stats && !loading && !error && (
            <>
              <div className="stat-cards">
                <StatCard label="Overall uptime" value={fmtPercent(stats.overall.uptimePercent)} />
                <StatCard label="Total checks" value={stats.overall.totalChecks.toLocaleString()} />
                <StatCard label="Failed checks" value={stats.overall.failedChecks.toLocaleString()} />
                <StatCard label="p95 latency" value={fmtMs(stats.overall.p95LatencyMs)} />
                <StatCard label="p99 latency" value={fmtMs(stats.overall.p99LatencyMs)} />
                <StatCard
                  label="Data quality"
                  value={`${stats.overall.anomalousStatusChecks} anomalous · ${stats.overall.latencyMissingChecks} missing latency`}
                  small
                />
              </div>

              <h3>By service</h3>
              <div className="service-bars">
                {stats.byService.map((s) => (
                  <div className="service-bar-row" key={s.serviceId}>
                    <span className="service-name">{s.serviceName}</span>
                    <div className="bar-track">
                      <div
                        className={`bar-fill ${barClass(s.uptimePercent)}`}
                        style={{ width: `${Math.max(2, s.uptimePercent ?? 0)}%` }}
                      />
                    </div>
                    <span className="service-figure">{fmtPercent(s.uptimePercent)}</span>
                    <span className="service-figure muted">{fmtMs(s.p95LatencyMs)} p95</span>
                  </div>
                ))}
              </div>

              <h3>Status breakdown</h3>
              <div className="status-chips">
                {stats.byStatusClass.map((s) => (
                  <span key={s.status_class} className={`chip chip-${s.status_class}`}>
                    {s.status_class}: {s.count.toLocaleString()}
                  </span>
                ))}
              </div>

              {stats.recentFailures.length > 0 && (
                <>
                  <h3>Most recent failures</h3>
                  <ul className="recent-failures">
                    {stats.recentFailures.map((f, i) => (
                      <li key={i}>
                        <code>{f.status_code_raw}</code> — {f.service_name} — {new Date(f.ts).toLocaleString()} — {f.agent}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function StatCard({ label, value, small }) {
  return (
    <div className="stat-card">
      <div className={`stat-value ${small ? 'stat-value-small' : ''}`}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function barClass(pct) {
  if (pct === null || pct === undefined) return '';
  if (pct >= 99.9) return 'bar-good';
  if (pct >= 99) return 'bar-warn';
  return 'bar-bad';
}

function fmtPercent(v) {
  return v === null || v === undefined ? '—' : `${v.toFixed(2)}%`;
}

function fmtMs(v) {
  if (v === null || v === undefined) return '—';
  return v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`;
}
