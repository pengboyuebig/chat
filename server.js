'use strict';

const { createChatServer, config } = require('./src/app');

const { server, io } = createChatServer();

server.listen(config.port, () => {
  console.log(`实时聊天服务已启动: http://localhost:${config.port}`);
});

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n收到 ${signal}，正在关闭服务...`);

  const force = setTimeout(() => {
    console.error('关闭超时，强制退出');
    process.exit(1);
  }, 5000);
  force.unref();

  io.close(() => {
    server.close(() => {
      clearTimeout(force);
      process.exit(0);
    });
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
