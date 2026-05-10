const app = require("../app");
const http = require("http");
const config = require("../config");
const { MongoClient } = require("mongodb");
const jwt = require("jsonwebtoken");
const createError = require("http-errors"); // 404 에러 생성을 위해 추가

const server = http.createServer(app);

async function start() {
  const client = new MongoClient(config.MONGODB_URI);
  await client.connect();
  const db = client.db("chat_db");
  console.log("✅ Auth Service: Database Connected");

  // 페르소나 설정 저장 API 라우트 정의
  app.post("/api/personaSet", async (req, res) => {
    // 프론트엔드에서 보낸 persona_config와 (필요하다면) 식별용 사용자/AI ID를 받습니다.
    const { persona_config, targetUser } = req.body;

    try {
      // 데이터가 제대로 넘어왔는지 방어 로직
      if (!persona_config) {
        return res
          .status(400)
          .json({ success: false, message: "Missing persona configuration" });
      }

      // 특정 대상(targetUser 등)에 대한 페르소나를 저장하거나 업데이트 (upsert)
      // ※ 만약 모든 사용자가 공통으로 쓰는 단일 설정이라면 필터를 빈 객체 {} 로 두거나, 식별자(userId 등)를 기준으로 검색조건을 설정하세요.
      const query = { targetUser: targetUser || "AI_ASSISTANT" };
      const updateDoc = {
        $set: {
          persona_config,
          updatedAt: new Date(), // 수정된 시간 기록
        },
      };
      const options = { upsert: true }; // 데이터가 없으면 새로 생성(insert), 있으면 업데이트(update)

      // DB 컬렉션 'persona'에 저장
      await db.collection("persona").updateOne(query, updateDoc, options);

      res.json({
        success: true,
        message: "페르소나 설정이 성공적으로 저장되었습니다.",
      });
    } catch (err) {
      console.error("Persona Save Error:", err);
      res
        .status(500)
        .json({ success: false, message: "Internal Server Error" });
    }
  });

  // 1. 로그인 API 라우트 정의
  app.post("/api/auth/login", async (req, res) => {
    const { userId, password } = req.body;
    try {
      const user = await db.collection("users").findOne({ userId });
      if (!user || user.password !== password) {
        return res
          .status(401)
          .json({ success: false, message: "Invalid credentials" });
      }
      if (!user.isApproved) {
        return res
          .status(403)
          .json({ success: false, message: "Account pending approval" });
      }

      const token = jwt.sign({ userId: user.userId }, config.JWT_SECRET, {
        expiresIn: "7d",
      });
      res.json({ success: true, token, userId: user.userId });
    } catch (err) {
      res
        .status(500)
        .json({ success: false, message: "Internal Server Error" });
    }
  });

  // 2. 회원가입 API 라우트 정의 (가입 시 isApproved: false 처리)
  app.post("/api/auth/register", async (req, res) => {
    const { userId, password } = req.body;

    if (!userId || !password) {
      return res
        .status(400)
        .json({ success: false, message: "아이디와 비밀번호를 입력해주세요." });
    }

    try {
      const existingUser = await db.collection("users").findOne({ userId });
      if (existingUser) {
        return res
          .status(409)
          .json({ success: false, message: "이미 존재하는 계정입니다." });
      }

      await db.collection("users").insertOne({
        userId,
        password, // 실무에서는 bcrypt 등으로 암호화 필수
        isApproved: false, // 승인 대기 상태
        createdAt: new Date(),
      });

      res
        .status(201)
        .json({
          success: true,
          message: "회원가입이 완료되었습니다. 관리자의 승인을 기다려주세요.",
        });
    } catch (err) {
      res
        .status(500)
        .json({ success: false, message: "Internal Server Error" });
    }
  });

  // 3. 계정 승인 API 라우트 정의 (관리자 전용)
  app.post("/api/auth/approve", async (req, res) => {
    const { targetUserId, adminSecret } = req.body;

    // 임시 보안: 환경변수나 하드코딩된 값으로 관리자 확인 (실무에서는 관리자 JWT 토큰으로 검증)
    const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET || "admin123";

    if (adminSecret !== ADMIN_SECRET_KEY) {
      return res
        .status(403)
        .json({ success: false, message: "관리자 권한이 없습니다." });
    }

    try {
      const result = await db
        .collection("users")
        .updateOne({ userId: targetUserId }, { $set: { isApproved: true } });

      if (result.matchedCount === 0) {
        return res
          .status(404)
          .json({ success: false, message: "해당 유저를 찾을 수 없습니다." });
      }

      res.json({
        success: true,
        message: `${targetUserId} 계정이 승인되었습니다.`,
      });
    } catch (err) {
      res
        .status(500)
        .json({ success: false, message: "Internal Server Error" });
    }
  });

  // 4. 활성화된(승인된) 유저 목록 조회 API (로비용)
  app.get("/api/users", async (req, res) => {
    try {
      // 보안을 위해 password 필드는 제외(0)하고, isApproved가 true인 유저만 가져옵니다.
      const users = await db
        .collection("users")
        .find({ isApproved: true })
        .project({ password: 0 })
        .toArray();
      res.json({ success: true, users });
    } catch (err) {
      res
        .status(500)
        .json({ success: false, message: "Internal Server Error" });
    }
  });

  // 처리되지 않은 모든 라우트는 404 에러로 넘김
  app.use(function (req, res, next) {
    next(createError(404));
  });

  // 최종 에러 처리 (API 서버이므로 HTML 대신 JSON 형태로 응답하도록 수정)
  app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    res.json({
      success: false,
      message: err.message,
      error: req.app.get("env") === "development" ? err : {},
    });
  });

  // 3. 서버 시작
  // server.listen(config.AUTH_PORT, () => {
  //     console.log(`🚀 Auth Server running on port ${config.AUTH_PORT}`);
  // });
  server.listen(config.AUTH_PORT, "0.0.0.0", () => {
    console.log(`🚀 Auth Server running on port ${config.AUTH_PORT}`);
  });

  // ==========================================
  // 🛑 Graceful Shutdown 처리
  // ==========================================
  const gracefulShutdown = async (signal) => {
    console.log(
      `\n🛑 [Auth Server] ${signal} 신호 수신: 연결을 안전하게 종료합니다...`,
    );
    try {
      // 1. Express 서버(HTTP) 신규 요청 차단
      server.close(() => {
        console.log("✅ HTTP 서버가 종료되었습니다.");
      });
      // 2. MongoDB 커넥션 종료
      if (client) {
        await client.close();
        console.log("✅ MongoDB 커넥션이 안전하게 종료되었습니다.");
      }
    } catch (err) {
      console.error("❌ 종료 중 에러 발생:", err);
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGINT", () => gracefulShutdown("SIGINT")); // Ctrl+C
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM")); // PM2 종료
  process.once("SIGUSR2", async () => {
    // Nodemon 재시작
    await gracefulShutdown("SIGUSR2");
    process.kill(process.pid, "SIGUSR2");
  });
}

start().catch(console.error);
