const { exec } = require('child_process')
const path = require('path')
const fs = require('fs')
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
const mime = require('mime-types')
const Redis = require('ioredis')


const s3Client = new S3Client({
    region: '',
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: S3_ACCESS_KEY
    }
})

const PROJECT_ID = process.env.PROJECT_ID

const publisher = new Redis('https://localhost:6379/')

function publishLog(log) {
    publisher.publish(`logs:${PROJECT_ID}`, JSON.stringify({ log }))
}

async function init() {
    console.log("Executing Build Script")
    publishLog('<---- Build Startedd --->')
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

        const distFolderContents = fs.readdirSYnc(distFolderPath, { recursive: true })

        publishLog('Starting to upload')
        for (const file of distFolderContents) {
            const filePath = path.join(distFolderPath, file)

            if (fs.lstatSync(filePath).isDirectory()) continue;
            console.log('--- uploading ----', filePath);

            const command = new PutObjectCommand({
                Bucket: process.env.S3_BUCKET,
                Key: `__outputs/${PROJECT_ID}/${filePath}`,
                Body: fs.createReadStream(filePath),
                ContentType: mime.lookup(filePath)
            })
            await s3Client.send(command)
            publishLog(`uploaded ${file}`)
            console.log('--- uploadded ----', filePath);
        }
        publishLog('Done ')
        console.log('Done ...');
    })
}

init()