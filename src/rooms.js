'use strict';

const config = require('./config');

/**
 * In-memory room store. Each room keeps the most recent messages so that
 * people who join later still see some context.
 */
class RoomStore {
  constructor({ maxHistory = config.maxHistory } = {}) {
    this.maxHistory = maxHistory;
    this.rooms = new Map();
  }

  get(name) {
    let room = this.rooms.get(name);
    if (!room) {
      room = { name, messages: [], users: new Map() };
      this.rooms.set(name, room);
    }
    return room;
  }

  addUser(roomName, socketId, nickname) {
    const room = this.get(roomName);
    room.users.set(socketId, nickname);
    return room;
  }

  removeUser(roomName, socketId) {
    const room = this.rooms.get(roomName);
    if (!room) return null;
    room.users.delete(socketId);
    if (room.users.size === 0 && room.messages.length === 0) {
      this.rooms.delete(roomName);
      return null;
    }
    return room;
  }

  addMessage(roomName, message) {
    const room = this.get(roomName);
    room.messages.push(message);
    if (room.messages.length > this.maxHistory) {
      room.messages.splice(0, room.messages.length - this.maxHistory);
    }
    return message;
  }

  history(roomName) {
    return this.get(roomName).messages.slice();
  }

  users(roomName) {
    return [...this.get(roomName).users.values()];
  }

  roomNames() {
    return [...this.rooms.keys()];
  }
}

module.exports = { RoomStore };
