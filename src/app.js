'use strict';

const http = require('node:http');
const path = require('node:path');
const express = require('express');
const { Server } = require('socket.io');
const config = require('./config');
const { registerSocketHandlers } = require('./sockets');

function createChatServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);

  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.get('/healthz', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

  const store = registerSocketHandlers(io);

  return { app, server, io, store };
}

module.exports = { createChatServer, config };
