const { exec } = require('child_process')
const path = require('path')
const fs = require('fs')
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
const mime = require('mime-types')
const Redis = require('ioredis')
const { Kafka } = require('kafkajs')
require('dotenv').config()


const s3Client = new S3Client({
    region: 'eu-north-1',
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
    }
})

const PROJECT_ID = process.env.PROJECT_ID
const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID

const kafka = new Kafka({
    clientId: `docker-build-server-${DEPLOYMENT_ID}`,
    brokers: ['test'],
    ssl: {},
    sasl: {
        username: 'bug',
        password: 'bug',
        mechanism: 'plain'
    }
})


const producer = kafka.producer()

async function publishLog(log) {

    await producer.send({
        topic: `container-logs`,
        messages: [{
            key: 'log',
            value: JSON.stringify({ PROJECT_ID, DEPLOYMENT_ID, log })
        }]
    })
}

async function disConnectLogs() {
    if (!publisher) {
        console.error('No active Redis client to disconnect.');
        return;
    }
    publishLog('<- Completed Deployment, stopping Logs -> ')
    await producer.disconnect()
}

async function init() {

    await producer.connect()

    console.log("Executing Build Script")
    await publishLog('<--- Build Started --->')
    const outDirPath = path.join(__dirname, 'output')

    const p = exec(`cd ${outDirPath} && npm install && npm run build`)

    p.stdout.on('data', async function(data) {
        console.log(data.toString())
        await publishLog(data.toString())
    })

    p.stdout.on('error', async function(data) {
        console.log('Error', data.toString())

        await publishLog(`error: ${data.toString()}`)
    })

    p.stdout.on('close', async function() {
        console.log('Build Complete')
        await publishLog('Build Completed')
        const distFolderPath = path.join(__dirname, 'output', 'dist')
        const distFolderContents = fs.readdirSync(distFolderPath, { recursive: true })

        await publishLog('Starting to upload')
        for (const file of distFolderContents) {
            const filePath = path.join(distFolderPath, file)
            if (fs.lstatSync(filePath).isDirectory()) continue;
            console.log('---- uploading ----', filePath);

            const command = new PutObjectCommand({
                Bucket: process.env.S3_BUCKET,
                Key: `__outputs/${PROJECT_ID}/${file}`,
                Body: fs.createReadStream(filePath),
                ContentType: mime.lookup(filePath)
            })
            await s3Client.send(command)
            await publishLog(`uploaded ${file}`)
            console.log('---- uploaded ----', filePath);
        }
        console.log('Done...')
        await publishLog('--> uploaded all files <-- ')
        await disConnectLogs()
    })
}

init()