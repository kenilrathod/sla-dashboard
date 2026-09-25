const {S3Client, PutObjectCommand} = require('@aws-sdk/client-s3')
const {getSignedUrl} = require("@aws-sdk/s3-request-presigner")
const express = require('express')
const BUCKET = process.env.BUCKET || "csvfiles"
const router = express.Router()
const {randomUUID} = require('crypto')
const {pool} = require('../db')

const s3Client = new S3Client({
    endpoint:"http://localhost:4566",
    credentials:{
        secretAccessKey:"test",
        accessKeyId:"test"
    },
    region:"us-east-1",
    forcePathStyle:true
})

router.post("/presign", async(req,res) => {
    console.log("here")
    try {
        const fileName = req.body.filename
        console.log(fileName)

        if(!fileName.toLowerCase().endsWith(".csv")) {
            return res.status(400).json({error: 'Only .csv files are accepted.'})
        }

        const uploadRunId = randomUUID();

        const s3Key = `uploads/${uploadRunId}/${fileName}`

        await pool.query(
            `INSERT INTO upload_runs
                (id, s3_key, original_filename, status)
                VALUES ($1, $2, $3, 'pending')`,
            [
            uploadRunId,
            s3Key,
            fileName
            ]
        );

        const command = new PutObjectCommand({
            Bucket:BUCKET,
            Key:s3Key,
            ContentType:'text/csv'
        })

        const preSignedUploadUrl = await getSignedUrl(
            s3Client,
            command,
            {   
                expiresIn:300 // 5 min 
            })
        
        return res.status(200).json(
            {
                uploadUrl:preSignedUploadUrl,
                uploadRunId,
                s3Key
            })

    } catch (error) {
        console.error('presign-upload error:', error);
        return res.status(500).json({
            error: 'Could not create upload URL.'
        });        
    }
})

router.get("/:uploadRunId/status", async(req,res) => {
    try {
        let uploadRunId = req.params?.uploadRunId
        if(uploadRunId.length != 36) {
            return res.status(400).json({
                error: "Invalid upload id."
            })
        }

        const {rows} = await pool.query(`SELECT * FROM upload_runs WHERE id = $1`,[uploadRunId])

        if (rows.length === 0) {
            return res.status(404).json({
                error: "Upload not found."
            });
        }
        console.log(rows)
        return res.status(200).json(rows[0]);

    } catch (error) {
        console.log("Upload status error ",error)
        return res.status(500).json({
            error: "Could not fetch upload status."
        })
    }
})

module.exports = router



