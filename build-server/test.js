const Redis = require('ioredis');
const redis = new Redis('redis-test'); // Connects to Redis at localhost:6379 by default

// Function to publish messages to a channel
function publishMessage(channel, message) {
    // Convert the message to a string if it's not already
    const msgString = typeof message === 'string' ? message : JSON.stringify(message);

    // Publish the message to the specified channel
    redis.publish(`logs:${channel}`, msgString)
        .then(() => console.log(`Message "${msgString}" published to channel "${channel}"`))
        .catch(err => console.error(`Failed to publish message: ${err}`));
}

// Example usage
publishMessage('ddd3', 'Hello, Redis!');