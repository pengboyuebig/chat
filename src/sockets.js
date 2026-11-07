'use strict';

const config = require('./config');
const { RoomStore } = require('./rooms');

let counter = 0;
const nextId = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`;

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

function validateJoin(payload) {
  const room = clean(payload && payload.room);
  const nickname = clean(payload && payload.nickname);

  if (!room) return { error: '请填写房间名' };
  if (room.length > config.limits.room) return { error: '房间名过长' };
  if (!nickname) return { error: '请填写昵称' };
  if (nickname.length > config.limits.nickname) return { error: '昵称过长' };
  if (!/^[\w\-\u4e00-\u9fa5 .]+$/u.test(room)) return { error: '房间名包含非法字符' };

  return { room, nickname };
}

function validateMessage(payload) {
  const text = clean(payload && payload.text);
  if (!text) return { error: '消息不能为空' };
  if (text.length > config.limits.message) return { error: '消息过长' };
  return { text };
}

function createRateLimiter({ windowMs, maxMessages }) {
  const hits = new Map();
  return {
    allow(socketId) {
      const now = Date.now();
      const recent = (hits.get(socketId) || []).filter((t) => now - t < windowMs);
      if (recent.length >= maxMessages) {
        hits.set(socketId, recent);
        return false;
      }
      recent.push(now);
      hits.set(socketId, recent);
      return true;
    },
    clear(socketId) {
      hits.delete(socketId);
    },
  };
}

function registerSocketHandlers(io, { store = new RoomStore() } = {}) {
  const limiter = createRateLimiter(config.rateLimit);

  io.on('connection', (socket) => {
    socket.on('join', (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const { room, nickname, error } = validateJoin(payload);
      if (error) return reply({ ok: false, error });

      const previous = socket.data.room;
      if (previous && previous !== room) leaveCurrentRoom(socket, previous, store, io);

      socket.data.room = room;
      socket.data.nickname = nickname;
      socket.join(room);
      store.addUser(room, socket.id, nickname);

      reply({
        ok: true,
        room,
        nickname,
        history: store.history(room),
        users: store.users(room),
      });

      io.to(room).emit('presence', { room, users: store.users(room) });
      if (previous !== room) {
        socket.to(room).emit('system', {
          id: nextId(),
          room,
          type: 'join',
          text: `${nickname} 加入了聊天室`,
          ts: Date.now(),
        });
      }
    });

    socket.on('message', (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const { room, nickname } = socket.data;
      if (!room) return reply({ ok: false, error: '请先加入房间' });
      if (!limiter.allow(socket.id)) return reply({ ok: false, error: '发送太快了，请稍后再试' });

      const { text, error } = validateMessage(payload);
      if (error) return reply({ ok: false, error });

      const message = store.addMessage(room, {
        id: nextId(),
        room,
        nickname,
        text,
        ts: Date.now(),
      });

      io.to(room).emit('message', message);
      reply({ ok: true, message });
    });

    socket.on('typing', (payload) => {
      const { room, nickname } = socket.data;
      if (!room) return;
      socket.to(room).emit('typing', {
        room,
        nickname,
        typing: Boolean(payload && payload.typing),
      });
    });

    socket.on('disconnect', () => {
      limiter.clear(socket.id);
      const room = socket.data.room;
      if (room) leaveCurrentRoom(socket, room, store, io);
    });
  });

  return store;
}

function leaveCurrentRoom(socket, room, store, io) {
  const nickname = socket.data.nickname;
  socket.leave(room);
  store.removeUser(room, socket.id);
  socket.data.room = null;

  io.to(room).emit('presence', { room, users: store.users(room) });
  if (nickname) {
    socket.to(room).emit('system', {
      id: nextId(),
      room,
      type: 'leave',
      text: `${nickname} 离开了聊天室`,
      ts: Date.now(),
    });
  }
}

module.exports = { registerSocketHandlers, validateJoin, validateMessage, RoomStore };
