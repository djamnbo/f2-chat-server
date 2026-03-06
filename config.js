const dotenv = require('dotenv');
const path = require('path');

// NODE_ENV에 따라 .env 파일 로드
const env = process.env.NODE_ENV || 'local';
dotenv.config({ path: path.join(__dirname, `./.env.${env}`) });

module.exports = {
    NODE_ENV: env,
    PORT: process.env.PORT || 3000,
    AUTH_PORT: process.env.AUTH_PORT || 3001,
    MONGODB_URI: process.env.MONGODB_URI,
    REDIS_HOST: process.env.REDIS_HOST,
    REDIS_PORT: process.env.REDIS_PORT || 6379,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD || undefined,
    RABBITMQ_URL: process.env.RABBITMQ_URL,
    SERVER_ID: process.env.SERVER_ID || 'conn-1',
    AI_BOT_ID: process.env.AI_BOT_ID || 'AI_ASSISTANT',
    JWT_SECRET: process.env.JWT_SECRET || 'ficfack_secret_key',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY
};