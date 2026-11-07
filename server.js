'use strict';

const { createChatServer, config } = require('./src/app');

const { server } = createChatServer();

server.listen(config.port, () => {
  console.log(`实时聊天服务已启动: http://localhost:${config.port}`);
});

function shutdown(signal) {
  console.log(`\n收到 ${signal}，正在关闭服务...`);
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
