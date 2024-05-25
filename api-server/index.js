const express = require('express')
const { generateSlug } = require('random-word-slugs')
const { ECSClient, RunTaskCommand } = require('@aws-sdk/client-ecs')
const { Server } = require('socket.io')
const Redis = require('ioredis')
require('dotenv').config()

const API_PORT = 9000
const SOCKET_PORT = 9002


const app = express()
const subscriber = new Redis('localhost:6379')
const io = new Server({ cors: '*' })

const ecsClient = new ECSClient({
    region: 'eu-north-1',
    credentials: {
        accessKeyId: process.env.ECS_ACCESS_ID,
        secretAccessKey: process.env.ECS_SECRET_KEY
    }
})

const config = {
    CLUSTER: process.env.CLUSTER_ARN,
    TASK: process.env.BUILDER_ARN
}

app.use(express.json())

io.on('connection', socket => {
    socket.on('subscribe', channel => {
        socket.join(channel)
        socket.emit('message', `Joined ${channel} by unfixedbug`)
    })
})

app.post('/project', async(req, res) => {
    const { gitUrl, slug } = req.body
    const projectSlug = slug ? slug : generateSlug()

    // spin container via api call

    const command = new RunTaskCommand({
        cluster: config.CLUSTER,
        taskDefinition: config.TASK,
        launchType: 'FARGATE',
        count: 1,
        networkConfiguration: {
            awsvpcConfiguration: {
                assignPublicIp: 'ENABLED',
                subnets: ['subnets123', 'subnets6969'],
                securityGroups: ['somesecurity Group']
            }

        },
        overrides: {
            containerOverrides: [{
                name: 'builder-image',
                environment: [
                    { name: 'GIT_REPO_URL', value: gitUrl },
                    { name: 'PROJECT_ID', value: projectSlug },
                    { name: 'S3_ACCESS_KEY', value: process.env.S3_ACCESS_KEY },
                    { name: 'S3_SECRET_ACCESS_KEY', value: process.env.S3_SECRET_ACCESS_KEY },
                    { name: 'S3_BUCKET', value: process.env.S3_BUCKET }
                ]
            }]
        }
    })

    await ecsClient.send(command)

    return res.json({
        status: 'queued',
        data: {
            projectSlug,
            url: `http://${projectSlug}.localhost:8000`
        }
    })

})


async function initRedisSubscribe() {
    console.log('Subscribed to Logs --->')
    subscriber.psubscribe('logs:*')
    subscriber.on('pmessage', (pattern, channel, message) => {
        io.to(channel).emit('message', message)
    })
}
initRedisSubscribe()

app.listen(API_PORT, () => console.log(` API Server Running on : ${API_PORT}`))

io.listen(SOCKET_PORT, () => console.log(`Socker Server running gracefully on ${SOCKET_PORT}}`))