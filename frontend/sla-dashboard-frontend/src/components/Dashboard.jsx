import React from 'react'
import { useEffect, useState } from 'react';

function Dashboard({ onBackToUpload }) {
  const [serviceId, setServiceId] = useState('all');
  const [statsFrom, setStatsFrom] = useState('');
  const [statsTo, setStatsTo] = useState('');

  useEffect(() => {
  }, []);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>SLA Monitoring Dashboard</h1>
        <button className="secondary" onClick={onBackToUpload}>Upload another file</button>
      </header>

      <div className="global-filters">
        <label>
          Service
          <select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            <option value="all">All services</option>
          </select>
        </label>
        <label>
          Stats from <input type="date" value={statsFrom} onChange={(e) => setStatsFrom(e.target.value)} />
        </label>
        <label>
          Stats to <input type="date" value={statsTo} onChange={(e) => setStatsTo(e.target.value)} />
        </label>
      </div>
    </div>
  );
}


export default Dashboard
