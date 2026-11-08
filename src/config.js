'use strict';

function int(value, fallback) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const config = {
  port: int(process.env.PORT, 3000),
  maxHistory: int(process.env.MAX_HISTORY, 100),
  password: process.env.CHAT_PASSWORD || '',
  limits: {
    nickname: 24,
    room: 40,
    message: 2000,
    rooms: int(process.env.MAX_ROOMS, 200),
    usersPerRoom: int(process.env.MAX_USERS_PER_ROOM, 100),
    connections: int(process.env.MAX_CONNECTIONS, 500),
  },
  rateLimit: {
    messages: {
      windowMs: 5000,
      maxMessages: int(process.env.MAX_MESSAGES_PER_5S, 20),
    },
    typing: {
      windowMs: 1000,
      maxMessages: 5,
    },
  },
};

module.exports = config;
