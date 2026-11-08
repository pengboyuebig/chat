'use strict';

const crypto = require('node:crypto');
const config = require('./config');
const { RoomStore } = require('./rooms');

let counter = 0;
const nextId = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`;

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

const digest = (value) => crypto.createHash('sha256').update(String(value)).digest();

function passwordMatches(input, expected) {
  return crypto.timingSafeEqual(digest(input || ''), digest(expected));
}

function validateJoin(payload, limits = config.limits) {
  const room = clean(payload && payload.room);
  const nickname = clean(payload && payload.nickname);

  if (!room) return { error: '请填写房间名' };
  if (room.length > limits.room) return { error: '房间名过长' };
  if (!nickname) return { error: '请填写昵称' };
  if (nickname.length > limits.nickname) return { error: '昵称过长' };
  if (!/^[\w\-\u4e00-\u9fa5 .]+$/u.test(room)) return { error: '房间名包含非法字符' };

  return { room, nickname };
}

function validateMessage(payload, limits = config.limits) {
  const text = clean(payload && payload.text);
  if (!text) return { error: '消息不能为空' };
  if (text.length > limits.message) return { error: '消息过长' };
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

function registerSocketHandlers(io, { store, settings = config } = {}) {
  const roomStore = store || new RoomStore({ maxHistory: settings.maxHistory });
  const limiter = createRateLimiter(settings.rateLimit.messages);
  const typingLimiter = createRateLimiter(settings.rateLimit.typing);
  const maxConnections = settings.limits.connections;
  let connections = 0;

  io.on('connection', (socket) => {
    connections += 1;
    if (connections > maxConnections) {
      socket.emit('rejected', { reason: '服务器连接数已达上限，请稍后再试' });
      socket.disconnect(true);
      connections -= 1;
      return;
    }

    socket.on('join', (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};

      if (settings.password && !passwordMatches(payload && payload.password, settings.password)) {
        return reply({ ok: false, code: 'BAD_PASSWORD', error: '访问密码不正确' });
      }

      const { room, nickname, error } = validateJoin(payload, settings.limits);
      if (error) return reply({ ok: false, error });

      const takenBy = findNicknameOwner(io, roomStore, room, nickname, socket.id);
      if (takenBy) {
        return reply({ ok: false, code: 'NICKNAME_TAKEN', error: '该昵称已在房间中使用' });
      }

      const alreadyInRoom = roomStore.entries(room).some(([id]) => id === socket.id);
      if (!roomStore.has(room) && roomStore.size >= settings.limits.rooms) {
        if (!roomStore.evictIdleRoom()) {
          return reply({ ok: false, code: 'ROOM_LIMIT', error: '房间数量已达上限，请稍后再试' });
        }
      }
      if (!alreadyInRoom && roomStore.users(room).length >= settings.limits.usersPerRoom) {
        return reply({ ok: false, code: 'ROOM_FULL', error: '房间人数已达上限' });
      }

      const previous = socket.data.room;
      if (previous && previous !== room) leaveCurrentRoom(socket, previous, roomStore, io);

      socket.data.room = room;
      socket.data.nickname = nickname;
      socket.join(room);
      roomStore.addUser(room, socket.id, nickname);

      reply({
        ok: true,
        room,
        nickname,
        history: roomStore.history(room),
        users: roomStore.users(room),
      });

      io.to(room).emit('presence', { room, users: roomStore.users(room) });
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

      const { text, error } = validateMessage(payload, settings.limits);
      if (error) return reply({ ok: false, error });

      const message = roomStore.addMessage(room, {
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
      if (!typingLimiter.allow(socket.id)) return;
      socket.to(room).emit('typing', {
        room,
        nickname,
        typing: Boolean(payload && payload.typing),
      });
    });

    socket.on('disconnect', () => {
      connections -= 1;
      limiter.clear(socket.id);
      typingLimiter.clear(socket.id);
      const room = socket.data.room;
      if (room) leaveCurrentRoom(socket, room, roomStore, io);
    });
  });

  return roomStore;
}

/**
 * Returns true when the nickname is used by another *connected* socket.
 * Stale entries left behind by a reconnect are removed so a user can rejoin.
 */
function findNicknameOwner(io, store, room, nickname, selfId) {
  for (const [id, name] of store.entries(room)) {
    if (name !== nickname || id === selfId) continue;
    if (io.sockets.sockets.has(id)) return true;
    store.removeUser(room, id);
  }
  return false;
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

module.exports = {
  registerSocketHandlers,
  validateJoin,
  validateMessage,
  passwordMatches,
  RoomStore,
};
