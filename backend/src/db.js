const {Pool} = require("pg")

const pool = new Pool({
    host:process.env.HOST,
    port:Number(process.env.PGPORT || 5432),
    database:process.env.DATABASE,
    user:process.env.USER,
    password:process.env.PASSWORD,
    ssl:false,
    max:10,
    idleTimeoutMillis:30000
})

pool.on('error', (err) => {
    console.error("Database connection error", err)
})

module.exports = {pool}