const express = require('express')
const cors = require('cors')
require('dotenv').config()

const {pool} = require('./db')

//Router File
const signedUrl = require('./routes/signedUrl')
const statsRoute = require('./routes/stats');
const logsRoute = require('./routes/logs');
const servicesRoute = require('./routes/services');

const app = express()
const PORT = process.env.PORT || 4000
// Todo
app.use(cors({origin:'*'}))
app.use(express.json())

//Router
app.use("/uploads", signedUrl)
app.use('/api/stats', statsRoute);
app.use('/api/logs', logsRoute);
app.use('/api/services', servicesRoute);

// 404
app.use((req,res) => {
    res.status(404).json({error: `No Route of ${req.path}`})
})

app.use((err,req,res,next) => {
    console.log("Unhandled Error",err)
    res.status(500).json({error:"Internal Server Error"})
})

app.listen(PORT,() => {
    console.log("Service started on port ",PORT)
})


