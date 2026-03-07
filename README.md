# 🚀 F2 Chat Server (Backend)

Node.js + Express + Socket.io + RabbitMQ + Redis + MongoDB 기반의 대규모 분산 처리 채팅 서버입니다.

이 프로젝트는 트래픽 부하 분산과 가용성을 위해 4개의 독립적인 프로세스(Auth, Connection, Worker, AI Bot)로 분리되어 설계되었습니다.

## 🏗 시스템 아키텍처 (System Architecture)

서버는 역할에 따라 다음과 같이 4개의 독립된 마이크로서비스 형태로 구동됩니다.

1. 인증 서버 (Auth Server - Port 3001)
   - 역할: REST API 기반 사용자 로그인, 회원가입, 관리자 승인 처리, JWT 발급. 
2. 커넥션 서버 (Connection Server - Port 3000)
   - 역할: 클라이언트(웹/앱)와 WebSocket(Socket.io) 연결 유지, 실시간 메시지 발송 및 수신. 
3. 채팅 워커 (Chat Worker)
   - 역할: RabbitMQ 큐에서 메시지를 꺼내 MongoDB에 영구 저장하고, Redis Pub/Sub을 통해 올바른 커넥션 서버로 메시지를 라우팅하는 비동기 작업 처리. 
4. AI 봇 워커 (AI Bot Worker - Gemini 연동)
   - 역할: AI_ASSISTANT에게 전송된 메시지를 가로채어 과거 대화 컨텍스트를 분석하고, Google Gemini API(2.5 Flash)를 통해 힐링 메시지를 생성하여 답변.


## 🔐 인프라 보안 및 로컬 개발 전략 (SSH Tunneling)

실제 개발 서버(app.ficfack.in)의 데이터베이스(MongoDB)와 메시지 큐(RabbitMQ, Redis)는 보안을 위해 외부망 접근이 철저히 차단(127.0.0.1로만 바인딩)되어 있습니다.

따라서 로컬 PC에서 개발할 때는 **SSH 터널링(포트 포워딩)**을 통해 로컬호스트처럼 안전하게 서버 인프라에 접속하는 방식을 사용합니다. 이 과정은 npm run start:all 스크립트를 통해 자동화되어 있습니다.

### 🛠 1. 설치 및 사전 준비 (Prerequisites)

1) SSH 키 등록 (비밀번호 없는 접속 세팅)

자동화된 터널링을 위해 로컬 PC의 SSH 공개키가 개발 서버에 등록되어 있어야 합니다. (최초 1회만 수행)

```bash
# 1. 로컬 PC에 SSH 키가 없다면 생성 (전부 Enter)
ssh-keygen -t ed25519

# 2. 개발 서버(f2계정, 포트 2222)로 키 복사 (이때 서버 비밀번호 1회 필요)
ssh-copy-id -p 2222 f2@app.ficfack.in
```

터미널에 ssh -p 2222 f2@app.ficfack.in 입력 시 비밀번호 없이 바로 접속되면 성공입니다.

2) 패키지 설치

```bash
git clone <repository-url>
cd f2-chat-server
npm install
```

### ⚙️ 2. 환경 변수 설정 (.env.local)

프로젝트 루트에 .env.local 파일을 생성하고 아래 내용을 작성합니다.

> 주의: SSH 터널링을 사용하므로, 모든 외부 인프라 접속 주소는 반드시 127.0.0.1이어야 합니다!

```yml
# 로컬 개발 환경
NODE_ENV=local
PORT=3000
AUTH_PORT=3001

  # 인프라 접속 정보 (SSH 터널링을 통하므로 127.0.0.1 사용)
MONGODB_URI=mongodb://admin:secure_mongo_password_123!@127.0.0.1:27017/?authSource=admin

REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=secure_redis_password_123!

RABBITMQ_URL=amqp://admin:secure_mq_password_123!@127.0.0.1:5672

# 애플리케이션 식별자 및 키
SERVER_ID=local-conn-1
AI_BOT_ID=AI_ASSISTANT
JWT_SECRET=ficfack_secret_key
GEMINI_API_KEY=당신의_구글_제미나이_API_키를_여기에_입력하세요
```

### 🚀 3. 서버 구동 (Running the Server)

원클릭 실행 (자동 터널링 + 서버 4종 동시 구동)
```bash
npm run start:all
```


동작 순서:

1. 백그라운드에서 app.ficfack.in 서버로 SSH 터널링(27017, 6379, 5672 포트)을 연결합니다.
2. 터널링이 완전히 개방될 때까지 3초간 대기(delay)합니다.
3. concurrently를 통해 4개의 Node.js 프로세스(Auth, Conn, Worker, AI)가 동시에 실행됩니다.

종료 방법:

- 실행 중인 터미널 창에서 Ctrl + C를 누르면 concurrently가 모든 Node 프로세스와 SSH 터널링 포트까지 한 번에 깔끔하게 종료해 줍니다. (좀비 프로세스 방지)

### 🌐 4. 실서버 배포 가이드 (Deployment)

개발이 완료되어 실제 app.ficfack.in 서버에 배포할 때는 PM2를 사용합니다.

1. 서버 접속 및 코드 업데이트 (git pull)
2. .env.dev 파일 확인 (실서버용 환경변수)
3. PM2 Ecosystem으로 전체 서비스 백그라운드 구동

```bash
# PM2로 4개 프로세스 동시 실행 및 모니터링
pm2 start ecosystem.config.js
pm2 logs
```

(상세한 배포 과정은 프로젝트 내 deployment_guide.md 문서를 참고하세요.)