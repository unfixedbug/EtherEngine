const express = require('express')
const { generateSlug } = require('random-word-slugs')
const { ECSClient, RunTaskCommand } = require('@aws-sdk/client-ecs')
const { Server } = require('socket.io')
const Redis = require('ioredis')
const { z } = require('zod')
const { PrismaClient } = require('@prisma/client')
const { createClient } = require('@clickhouse/client')
const { Kafka } = require('kafkajs')
const { error } = require('console')
const { emitWarning, eventNames } = require('process')
require('dotenv').config()



const API_PORT = 9000
const SOCKET_PORT = 9002


const app = express()

const clickhouseclient = createClient({
    host: 'hoster',
    database: 'default',
    username: 'bug',
    password: 'pass'
})
const prisma = new PrismaClient()

const kafka = new Kafka({
    clientId: `api-server`,
    brokers: ['test'],
    ssl: {},
    sasl: {
        username: 'bug',
        password: 'bug',
        mechanism: 'plain'
    }
})

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

const consumer = kafka.consumer({
    groupId: 'api-server-logs-consumer'
})

app.use(express.json())


app.post('/project', async(req, res) => {
    const schema = z.object({
        name: z.string(),
        gitUrl: z.string()
    })

    const safeParseResult = schema.safeParse(req.body)

    if (safeParseResult.error) return res.status(400).json({ error: safeParseResult.error })

    // validated Data
    const { name, gitUrl } = safeParseResult.data

    const project = await prisma.project.create({
        data: {
            name: name,
            git_url: gitUrl,
            sub_domain: generateSlug()
        }
    })

    return res.json({ status: 'success', data: { project } })
})

app.post('/deploy', async(req, res) => {
    const { projectId } = req.body
    const projet = await prisma.project.findUnique({
        where: {
            id: projectId
        }
    })

    if (!projet) return res.status(404).json({ error: 'Project Not Found' })

    // create deployment
    const deployment = await prisma.deployment.create({
        data: {
            project: { connect: { id: projectId } },
            status: 'QUEUED'
        }
    })



    // spin container via api call

    const command = new RunTaskCommand({
        cluster: config.CLUSTER,
        taskDefinition: config.TASK,
        launchType: 'FARGATE',
        count: 1,
        networkConfiguration: {
            awsvpcConfiguration: {
                assignPublicIp: 'ENABLED',
                subnets: ['subnet-00db096d1770d5d97', 'subnet-05c57e273e75b213a', 'subnet-03d159d88ce14ddfc'],
                securityGroups: ['sg-08f4b6294f000c0f8']
            }

        },
        overrides: {
            containerOverrides: [{
                name: 'builder-image',
                environment: [
                    { name: 'GIT_REPO_URL', value: projet.git_url },
                    { name: 'PROJECT_ID', value: projectId },
                    { name: 'DEPLOYMENT_ID', value: deployment.id },
                    { name: 'S3_ACCESS_KEY', value: process.env.S3_ACCESS_KEY },
                    { name: 'S3_SECRET_ACCESS_KEY', value: process.env.S3_SECRET_ACCESS_KEY },
                    { name: 'S3_BUCKET', value: process.env.S3_BUCKET },
                    { name: 'REDIS_PUB', value: process.env.REDIS }
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


async function initKafkaConsumer() {
    await consumer.connect();
    await consumer.subscribe({ topics: ['container-logs'] })
    await consumer.run({
        autoCommit: false,
        eachBatch: async function({ batch, heartbeat, commitOffsetsIfNecessary, resolveOffset }) {
            const messages = batch.messages;
            console.log(`Received ${messages.length} messages..`)
            for (const msg of messages) {
                const stringMessage = msg.value.toString()
                const { PROJECT_ID, DEPLOYMENT_ID, log } = JSON.parse(stringMessage)
                await clickhouseclient.insert({
                    table: 'log_events',
                    values: [{ event_id: uuidv4(), deployment_id: DEPLOYMENT_ID, log }],
                    format: 'JSONEachRow'
                })

                resolveOffset(msg.offset)
                await commitOffsetsIfNecessary(msg.offset)
                await heartbeat()
            }
        }
    })
}

initKafkaConsumer()

app.listen(API_PORT, () => console.log(` API Server Running on : ${API_PORT}`))