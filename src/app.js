'use strict';

const http = require('node:http');
const path = require('node:path');
const express = require('express');
const { Server } = require('socket.io');
const config = require('./config');
const { registerSocketHandlers } = require('./sockets');

function mergeSettings(overrides = {}) {
  return {
    ...config,
    ...overrides,
    limits: { ...config.limits, ...(overrides.limits || {}) },
    rateLimit: {
      messages: { ...config.rateLimit.messages, ...((overrides.rateLimit || {}).messages || {}) },
      typing: { ...config.rateLimit.typing, ...((overrides.rateLimit || {}).typing || {}) },
    },
  };
}

function createChatServer(overrides = {}) {
  const settings = mergeSettings(overrides);
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);

  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/healthz', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

  app.get('/api/config', (req, res) => {
    res.json({
      authRequired: Boolean(settings.password),
      limits: {
        nickname: settings.limits.nickname,
        room: settings.limits.room,
        message: settings.limits.message,
      },
    });
  });

  const store = registerSocketHandlers(io, { settings });

  return { app, server, io, store, settings };
}

module.exports = { createChatServer, mergeSettings, config };
