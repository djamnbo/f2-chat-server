const amqp = require('amqplib');
const Redis = require('ioredis');
const { MongoClient } = require('mongodb');
const config = require('../config');

// 라우팅 명령을 내리기 위한 Redis Pub 연결
const redis = new Redis({ host: config.REDIS_HOST, port: config.REDIS_PORT });
const pub = new Redis({ host: config.REDIS_HOST, port: config.REDIS_PORT });

async function start() {
    console.log(`⏳ Starting Chat Worker...`);

    // 1. RabbitMQ 큐 연결
    const mqConn = await amqp.connect(config.RABBITMQ_URL);
    const channel = await mqConn.createChannel();
    await channel.assertQueue('chat_queue');
    await channel.assertQueue('ai_request_queue'); // AI용 큐도 미리 생성

    // 2. MongoDB 연결
    const dbClient = new MongoClient(config.MONGODB_URI);
    await dbClient.connect();
    const db = dbClient.db('chat_db');
    console.log(`✅ Chat Worker: Connected to MongoDB & RabbitMQ`);

    // 3. 큐에서 메시지를 하나씩 꺼내서 처리 (Consume)
    channel.consume('chat_queue', async (msg) => {
        if (!msg) return;

        // 큐에서 꺼낸 메시지 파싱
        const data = JSON.parse(msg.content.toString());
        console.log(`📥 [워커 수신] 큐에서 메시지 꺼냄:`, data);

        try {
            // ① 데이터베이스에 영구 저장 (채팅 이력)
            await db.collection('messages').insertOne(data);

            // ② AI 봇에게 보내는 메시지인지 확인
            if (data.to === config.AI_BOT_ID) {
                console.log(`🤖 AI 봇 메시지로 확인됨. ai_request_queue로 전달합니다.`);
                channel.sendToQueue('ai_request_queue', Buffer.from(JSON.stringify(data)));
            }
            // ③ 일반 유저에게 보내는 메시지인 경우
            else {
                // Redis에서 수신자의 현재 위치(서버) 조회
                const receiverRaw = await redis.get(`user:${data.to}`);

                if (receiverRaw) {
                    const receiver = JSON.parse(receiverRaw);
                    console.log(`🎯 수신자(${data.to}) 온라인 확인됨. 서버[${receiver.serverId}]로 라우팅 명령 전송.`);

                    // 수신자가 접속해 있는 커넥션 서버로 이벤트를 쏴줌 (Pub/Sub)
                    pub.publish(`route:${receiver.serverId}`, JSON.stringify({
                        ...data,
                        targetSocketId: receiver.socketId
                    }));
                } else {
                    console.log(`💤 수신자(${data.to}) 오프라인 상태입니다. (여기에 푸시 알림 로직 추가 가능)`);
                }
            }

            // 모든 처리가 정상적으로 끝나면 큐에서 메시지를 지움(ACK)
            channel.ack(msg);

        } catch (error) {
            console.error(`❌ 워커 처리 중 에러 발생:`, error);
            // 에러 시 큐에 다시 돌려놓기 (선택사항, 무한 루프 주의)
            // channel.nack(msg);
        }
    });
}

start().catch(err => {
    console.error("Critical Worker Error:", err);
    process.exit(1);
});
