'use strict';

const config = {
  port: Number(process.env.PORT) || 3000,
  maxHistory: Number(process.env.MAX_HISTORY) || 100,
  limits: {
    nickname: 24,
    room: 40,
    message: 2000,
  },
  rateLimit: {
    windowMs: 5000,
    maxMessages: 20,
  },
};

module.exports = config;
