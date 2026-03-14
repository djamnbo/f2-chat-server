const http = require('http');
const { Server } = require('socket.io');
const amqp = require('amqplib');
const Redis = require('ioredis');
const jwt = require('jsonwebtoken');
const config = require('../config');

const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end(`Connection Server [${config.SERVER_ID}] is running.`);
});

const io = new Server(server, { cors: { origin: "*" } });

const redis = new Redis({
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    password: config.REDIS_PASSWORD
});
const sub = new Redis({
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    password: config.REDIS_PASSWORD
});

async function start() {
    console.log(`⏳ Starting Connection Server [${config.SERVER_ID}]...`);

    const mqConn = await amqp.connect(config.RABBITMQ_URL);
    const channel = await mqConn.createChannel();
    await channel.assertQueue('chat_queue');

    sub.subscribe(`route:${config.SERVER_ID}`);
    sub.on('message', (chan, msg) => {
        const data = JSON.parse(msg);
        if (data.targetSocketId) {
            io.to(data.targetSocketId).emit('chat_receive', data);
        }
    });

    io.use((socket, next) => {
        const token = socket.handshake.query.token;
        if (!token) return next(new Error('인증 토큰이 필요합니다.'));

        jwt.verify(token, config.JWT_SECRET, (err, decoded) => {
            if (err) return next(new Error('유효하지 않은 토큰입니다.'));
            socket.userId = decoded.userId;
            next();
        });
    });

    io.on('connection', async (socket) => {
        const userId = socket.userId;

        await redis.set(`user:${userId}`, JSON.stringify({
            serverId: config.SERVER_ID,
            socketId: socket.id
        }));

        console.log(`🟢 User Connected: ${userId}`);

        socket.on('chat_send', (payload) => {
            // 💡 FIX: payload가 문자열로 들어올 경우 JSON 객체로 파싱합니다.
            let parsedPayload = payload;
            if (typeof payload === 'string') {
                try {
                    parsedPayload = JSON.parse(payload);
                } catch (e) {
                    console.error("JSON 파싱 에러:", e);
                    return;
                }
            }

            const message = {
                ...parsedPayload,
                from: userId,
                timestamp: Date.now()
            };

            channel.sendToQueue('chat_queue', Buffer.from(JSON.stringify(message)));
            console.log(`📤 [발송] RabbitMQ 큐에 저장 완료:`, message);
        });

        socket.on('disconnect', async () => {
            console.log(`🔴 User Disconnected: ${userId}`);
            await redis.del(`user:${userId}`);
        });
    });

    server.listen(config.PORT, () => {
        console.log(`🚀 Connection Server [${config.SERVER_ID}] running on port ${config.PORT}`);
    });

    // ==========================================
    // 🛑 Graceful Shutdown 처리
    // ==========================================
    const gracefulShutdown = async (signal) => {
        console.log(`\n🛑 [Chat Worker] ${signal} 신호 수신: 연결을 안전하게 종료합니다...`);
        try {
            // mqConn, dbClient, redis, pub 등 위에서 생성한 변수들이 접근 가능한 스코프여야 합니다.
            // (start 함수 바깥으로 선언을 빼거나, 전역 변수로 관리하는 것이 좋습니다.)

            // 예시:
            if (mqConn) await mqConn.close();
            // if (dbClient) await dbClient.close();
            if (redis) redis.disconnect();
            // if (pub) pub.disconnect();

            console.log('✅ 모든 커넥션(MQ, DB, Redis)이 종료되었습니다.');
        } catch (err) {
            console.error('❌ 종료 중 에러 발생:', err);
        } finally {
            process.exit(0);
        }
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.once('SIGUSR2', async () => {
        await gracefulShutdown('SIGUSR2');
        process.kill(process.pid, 'SIGUSR2');
    });
}

start().catch(console.error);
