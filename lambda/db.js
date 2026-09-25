const {Pool} = require('pg')

const pool = new Pool({
  host: "host.docker.internal",
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "slamonitor",
  user: process.env.PGUSER || "kenil",
  password: process.env.PGPASSWORD || "root",
  ssl: false,
  max: 5,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
    console.error("DataBase Connection Failed",err)
})

module.exports = {pool}