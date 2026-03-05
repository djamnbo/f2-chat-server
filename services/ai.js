const amqp = require('amqplib');
const { MongoClient } = require('mongodb');
const config = require('../config');

async function start() {
    console.log(`⏳ Starting AI Bot Worker...`);

    // 1. RabbitMQ 큐 연결
    const mqConn = await amqp.connect(config.RABBITMQ_URL);
    const channel = await mqConn.createChannel();
    await channel.assertQueue('chat_queue');
    await channel.assertQueue('ai_request_queue');

    // 2. MongoDB 연결
    const dbClient = new MongoClient(config.MONGODB_URI);
    await dbClient.connect();
    const db = dbClient.db('chat_db');
    console.log(`✅ AI Worker: Connected to MongoDB & RabbitMQ`);

    // 3. AI 요청 큐(ai_request_queue)에서 메시지 대기
    channel.consume('ai_request_queue', async (msg) => {
        if (!msg) return;

        const requestData = JSON.parse(msg.content.toString());
        console.log(`🤖 [AI 수신] 질문 받음 (From: ${requestData.from}):`, requestData.text);

        try {
            // [선택 사항] 대화 문맥을 파악하기 위해 최근 대화 내역 조회 가능
            // const history = await db.collection('messages')
            //    .find({ $or: [{ from: requestData.from, to: config.AI_BOT_ID }, { from: config.AI_BOT_ID, to: requestData.from }] })
            //    .sort({ timestamp: -1 }).limit(5).toArray();

            console.log(`🧠 AI가 답변을 생성 중입니다...`);

            // 4. LLM API 호출 (임시로 1.5초 지연으로 시뮬레이션)
            // 실무에서는 여기에 OpenAI, Gemini 등의 API 호출 코드가 들어갑니다.
            await new Promise(resolve => setTimeout(resolve, 1500));

            const aiResponseText = `[AI 응답] "${requestData.text}" 라고 말씀하셨군요! 저는 ${config.AI_BOT_ID} 입니다. 도움이 필요하시면 언제든 말씀해주세요.`;

            // 5. 생성된 답변을 일반 채팅 큐로 발송 (보낸 사람: AI_BOT_ID)
            const responseMessage = {
                from: config.AI_BOT_ID,
                to: requestData.from, // 나에게 질문한 사람에게 다시 전송
                text: aiResponseText,
                timestamp: Date.now()
            };

            channel.sendToQueue('chat_queue', Buffer.from(JSON.stringify(responseMessage)));
            console.log(`📤 [AI 발송] 큐에 응답 전달 완료.`);

            // 처리가 완료되었으므로 큐에서 메시지 삭제 (ACK)
            channel.ack(msg);

        } catch (error) {
            console.error(`❌ AI 워커 처리 중 에러 발생:`, error);
            // 필요에 따라 channel.nack(msg) 호출
        }
    });
}

start().catch(err => {
    console.error("Critical AI Worker Error:", err);
    process.exit(1);
});
