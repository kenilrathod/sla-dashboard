const express = require('express')
const cors = require('cors')
require('dotenv').config()

const {pool} = require('./db')

const app = express()
const PORT = process.env.PORT || 4000
// Todo
app.use(cors({origin:'*'}))
app.use(express.json())

//Router

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


