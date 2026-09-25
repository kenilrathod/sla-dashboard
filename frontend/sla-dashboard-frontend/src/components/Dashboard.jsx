import React from 'react'
import { useEffect, useState } from 'react';
import { getServices, getAgents } from '../api';
import StatsSection from './StatsSection'
import LogsTable from './LogsTable'

function Dashboard({ onBackToUpload }) {
  const [services, setServices] = useState([]);
  const [agents, setAgents] = useState([]);
  const [serviceId, setServiceId] = useState('all');
  const [statsFrom, setStatsFrom] = useState('');
  const [statsTo, setStatsTo] = useState('');
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    getServices()
      .then((res) => setServices(res.services))
      .catch((err) => setLoadError(err.message));
    getAgents()
      .then((res) => setAgents(res.agents))
      .catch(() => {});
  }, []);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>SLA Monitoring Dashboard</h1>
        <button className="secondary" onClick={onBackToUpload}>Upload another file</button>
      </header>

      {loadError && <p className="error-text">Could not reach the API: {loadError}</p>}

      <div className="global-filters">
        <label>
          Service
          <select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            <option value="all">All services</option>
          {services.map((s) => (
              <option key={s.service_id} value={s.service_id}>{s.service_name}</option>
            ))}
          </select>
        </label>
        <label>
          Stats from <input type="date" value={statsFrom} onChange={(e) => setStatsFrom(e.target.value)} />
        </label>
        <label>
          Stats to <input type="date" value={statsTo} onChange={(e) => setStatsTo(e.target.value)} />
        </label>
      </div>

      <StatsSection serviceId={serviceId} from={statsFrom} to={statsTo} />
      <LogsTable serviceId={serviceId} agents={agents} />

    </div>
  );
}


export default Dashboard
