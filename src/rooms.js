'use strict';

const config = require('./config');

/**
 * In-memory room store. Each room keeps the most recent messages so that
 * people who join later still see some context.
 *
 * Read helpers never create a room: only writes (addUser/addMessage) do.
 * That keeps empty rooms from being resurrected after cleanup.
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

  peek(name) {
    return this.rooms.get(name) || null;
  }

  has(name) {
    return this.rooms.has(name);
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

  entries(roomName) {
    const room = this.rooms.get(roomName);
    return room ? [...room.users.entries()] : [];
  }

  history(roomName) {
    const room = this.rooms.get(roomName);
    return room ? room.messages.slice() : [];
  }

  users(roomName) {
    const room = this.rooms.get(roomName);
    return room ? [...room.users.values()] : [];
  }

  roomNames() {
    return [...this.rooms.keys()];
  }

  /**
   * Drops the oldest room that has no connected users. Used to make room for a
   * new room once the configured room limit is reached.
   */
  evictIdleRoom() {
    for (const [name, room] of this.rooms) {
      if (room.users.size === 0) {
        this.rooms.delete(name);
        return name;
      }
    }
    return null;
  }

  get size() {
    return this.rooms.size;
  }
}

module.exports = { RoomStore };
