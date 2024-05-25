const { exec } = require('child_process')
const path = require('path')
const fs = require('fs')
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
const mime = require('mime-types')
const Redis = require('ioredis')
require('dotenv').config()


const s3Client = new S3Client({
    region: 'eu-north-1',
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
    }
})

const PROJECT_ID = process.env.PROJECT_ID

const publisher = new Redis('https://localhost:6379/')

function publishLog(log) {
    publisher.publish(`logs:${PROJECT_ID}`, JSON.stringify({ log }))
}

function disConnectLogs() {
    if (!publisher) {
        console.error('No active Redis client to disconnect.');
        return;
    }
    publishLog('<- Last Log -> ')
    publisher.disconnect()
}

async function init() {
    console.log("Executing Build Script")
    publishLog('<--- Build Started --->')
    const outDirPath = path.join(__dirname, 'output')

    const p = exec(`cd ${outDirPath} && npm install && npm run build`)

    p.stdout.on('data', function(data) {
        console.log(data.toString())
        publishLog(data.toString())
    })

    p.stdout.on('error', function(data) {
        console.log('Error', data.toString())

        publishLog(`error: ${data.toString()}`)
    })

    p.stdout.on('close', async function() {
        console.log('Build Complete')
        publishLog('Build Completed')
        const distFolderPath = path.join(__dirname, 'output', 'dist')
        const distFolderContents = fs.readdirSync(distFolderPath, { recursive: true })

        publishLog('Starting to upload')
        for (const file of distFolderContents) {
            const filePath = path.join(distFolderPath, file)
            if (fs.lstatSync(filePath).isDirectory()) continue;
            console.log('--- uploading ----', filePath);

            const command = new PutObjectCommand({
                Bucket: process.env.S3_BUCKET,
                Key: `__outputs/${PROJECT_ID}/${file}`,
                Body: fs.createReadStream(filePath),
                ContentType: mime.lookup(filePath)
            })
            await s3Client.send(command)
            publishLog(`uploaded ${file}`)
            console.log('--- uploaded ----', filePath);
        }
        console.log('Done...')
        publishLog('--> uploaded all files <-- ')
        disConnectLogs()

    })
}

init()