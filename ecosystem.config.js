module.exports = {
  apps: [
    {
      name: 'chat-auth',
      script: './services/auth.js',
      instances: 1, // 인증 서버 인스턴스 수
      autorestart: true,
      watch: false, // 실서버에서는 false 권장
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'dev'
      }
    },
    {
      name: 'chat-conn',
      script: './services/connection.js',
      instances: 1, // 커넥션 서버 인스턴스 수 (필요시 늘릴 수 있음)
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'dev'
      }
    },
    {
      name: 'chat-worker',
      script: './services/worker.js',
      instances: 1, // 트래픽이 많아지면 인스턴스를 늘려 병렬 처리 가능
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'dev'
      }
    },
    {
      name: 'chat-ai',
      script: './services/ai.js', // AI 봇 스크립트 (구현되었다고 가정)
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'dev'
      }
    }
  ]
};
