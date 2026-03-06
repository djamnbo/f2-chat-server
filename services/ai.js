const amqp = require('amqplib');
const { MongoClient } = require('mongodb');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config'); // 경로 주의: 필요시 '../src/config' 로 변경

// Gemini API 초기화
const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);

// 힐링 봇의 페르소나 (System Instruction 역할)
const SYSTEM_PROMPT = `
당신은 사람들의 마음을 치유하고 위로해주는 전문 심리 상담가이자 '마음챙김 AI 비서'입니다.
- 사용자의 감정에 깊이 공감하고, 따뜻하고 부드러운 말투(해요체)를 사용하세요.
- 비판하거나 가르치려 들지 말고, 경청하는 태도로 답변하세요.
- 답변은 너무 길지 않게 모바일 채팅에 적합한 길이(1~3문단)로 작성하세요.
- 적절하고 따뜻한 이모티콘(🌿, 🍃, 🤍 등)을 자연스럽게 사용하세요.
`;

async function start() {
    console.log(`⏳ Starting AI Bot Worker (Gemini Integration)...`);

    // 1. RabbitMQ 큐 연결
    const mqConn = await amqp.connect(config.RABBITMQ_URL);
    const channel = await mqConn.createChannel();
    await channel.assertQueue('chat_queue');
    await channel.assertQueue('ai_request_queue');

    // 2. MongoDB 연결 (대화 내역 조회용)
    const dbClient = new MongoClient(config.MONGODB_URI);
    await dbClient.connect();
    const db = dbClient.db('chat_db');
    console.log(`✅ AI Worker: Connected to MongoDB & RabbitMQ`);

    // 3. AI 요청 큐에서 메시지 대기
    channel.consume('ai_request_queue', async (msg) => {
        if (!msg) return;

        const requestData = JSON.parse(msg.content.toString());
        console.log(`🤖 [AI 수신] 질문 받음 (From: ${requestData.from}):`, requestData.text);

        try {
            // 4. 최근 대화 내역(Context) 조회 (해당 유저와 AI 봇 간의 대화)
            const rawHistory = await db.collection('messages')
                .find({
                    $or: [
                        { from: requestData.from, to: config.AI_BOT_ID },
                        { from: config.AI_BOT_ID, to: requestData.from }
                    ]
                })
                .sort({ timestamp: -1 })
                .limit(10) // 최근 10개 메시지만 기억
                .toArray();

            // Gemini History 형식에 맞게 변환 (과거순 정렬을 위해 reverse)
            const chatHistory = rawHistory.reverse().map(chat => ({
                role: chat.from === config.AI_BOT_ID ? 'model' : 'user',
                parts: [{ text: chat.text }]
            }));

            // 페르소나 주입 (첫 대화거나 히스토리가 적을 때 프롬프트 강화)
            const model = genAI.getGenerativeModel({
                model: "gemini-2.5-flash", // 빠르고 무료 티어에 적합한 모델
                systemInstruction: SYSTEM_PROMPT // Gemini 1.5 이상에서 지원하는 시스템 프롬프트
            });

            const chatSession = model.startChat({
                history: chatHistory,
            });

            console.log(`🧠 Gemini API 호출 중...`);

            // 5. Gemini API로 메시지 전송 및 답변 받기
            const result = await chatSession.sendMessage(requestData.text);
            const aiResponseText = result.response.text();

            // 6. 생성된 답변을 일반 채팅 큐로 발송
            const responseMessage = {
                from: config.AI_BOT_ID,
                to: requestData.from, // 질문한 사람에게 답장
                text: aiResponseText,
                timestamp: Date.now()
            };

            channel.sendToQueue('chat_queue', Buffer.from(JSON.stringify(responseMessage)));
            console.log(`📤 [AI 발송] Gemini 응답 전달 완료.`);

            // 정상 처리 후 큐에서 삭제
            channel.ack(msg);

        } catch (error) {
            console.error(`❌ Gemini API 처리 에러:`, error);

            // 에러 발생 시 유저에게 안내 메시지 발송
            const errorMessage = {
                from: config.AI_BOT_ID,
                to: requestData.from,
                text: "미안해요, 지금 제 마음에 작은 오류가 생겨서 대답하기 어려워요. 🥲 잠시 후 다시 말을 걸어주시겠어요?",
                timestamp: Date.now()
            };
            channel.sendToQueue('chat_queue', Buffer.from(JSON.stringify(errorMessage)));

            // 큐에서 일단 지워서 무한 루프 방지 (또는 재시도를 위해 nack 활용 가능)
            channel.ack(msg);
        }
    });
}

start().catch(err => {
    console.error("Critical AI Worker Error:", err);
    process.exit(1);
});
