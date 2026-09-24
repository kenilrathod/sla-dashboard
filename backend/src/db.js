const {Pool} = require("pg")

const pool = new Pool({
    host:process.env.HOST,
    port:process.env.PGPORT,
    database:process.env.DATABASE,
    password:process.env.PASSWORD,
    ssl:false,
    max:10,
    idleTimeoutMillis:30000
})

pool.on('error', (err) => {
    console.error("Database connection error", err)
})

module.exports = {pool}