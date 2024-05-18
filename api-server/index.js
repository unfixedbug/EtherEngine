const express = require('express')
const { generateSlug } = require('random-word-slugs')
const { ECSClient, RunTaskCommand } = require('@aws-sdk/client-ecs')
const { Server } = require('socket.io')
const Redis = require('ioredis')

const app = express()
const PORT = 9000

const subscriber = new Redis('localhost:6379')

const io = new Server({ cors: '*' })
io.listen(9001, () => console.log('Socker Server running gracefully on 9001'))

const ecsClient = new ECSClient({
    region: 'dakota',
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
                    { name: 'PROJECT_ID', value: projectSlug }
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


proxy.on('proxyReq', (proxyReq, req, res) => {
    const url = req.url;
    if (url === '/')
        proxyReq.path += 'index.html'
})

async function initRedisSubscribe() {
    console.log('Subscribed to Log --->')
    subscriber.psubscribe('logs:*')
    subscriber.on('pmessage', (pattern, channel, message) => {
        io.to(channel).emit('message', message)
    })
}
initRedisSubscribe()

app.listen(PORT, () => console.log(`<--- API Server Running.. ${PORT}`))