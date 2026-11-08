'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { RoomStore } = require('../src/rooms');

test('read helpers do not create rooms', () => {
  const store = new RoomStore();
  assert.deepEqual(store.history('missing'), []);
  assert.deepEqual(store.users('missing'), []);
  assert.deepEqual(store.entries('missing'), []);
  assert.equal(store.has('missing'), false);
  assert.equal(store.size, 0);
});

test('removing the last user deletes an empty room', () => {
  const store = new RoomStore();
  store.addUser('a', 's1', 'Ann');
  store.removeUser('a', 's1');

  assert.equal(store.has('a'), false);
  assert.deepEqual(store.users('a'), []);
  assert.equal(store.size, 0);
});

test('a room with history survives until evicted', () => {
  const store = new RoomStore();
  store.addUser('a', 's1', 'Ann');
  store.addMessage('a', { text: 'hi' });
  store.removeUser('a', 's1');

  assert.equal(store.has('a'), true);
  assert.deepEqual(store.history('a').map((m) => m.text), ['hi']);
  assert.equal(store.evictIdleRoom(), 'a');
  assert.equal(store.has('a'), false);
});

test('history is capped at maxHistory', () => {
  const store = new RoomStore({ maxHistory: 2 });
  for (let i = 0; i < 5; i += 1) store.addMessage('a', { text: String(i) });

  assert.deepEqual(store.history('a').map((m) => m.text), ['3', '4']);
});
