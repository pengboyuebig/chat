'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { io: createClient } = require('socket.io-client');
const { createChatServer } = require('../src/app');

let server;
let url;

before(async () => {
  const chat = createChatServer();
  server = chat.server;
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  url = `http://localhost:${port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function connect() {
  return new Promise((resolve, reject) => {
    const client = createClient(url, { transports: ['websocket'], forceNew: true });
    client.once('connect', () => resolve(client));
    client.once('connect_error', reject);
  });
}

function emitWithAck(client, event, payload) {
  return new Promise((resolve) => client.emit(event, payload, resolve));
}

function once(client, event) {
  return new Promise((resolve) => client.once(event, resolve));
}

function waitForSystem(client, type) {
  return new Promise((resolve) => {
    const handler = (payload) => {
      if (payload.type === type) {
        client.off('system', handler);
        resolve(payload);
      }
    };
    client.on('system', handler);
  });
}

test('health endpoint responds', async () => {
  const res = await fetch(`${url}/healthz`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
});

test('rejects join without nickname', async () => {
  const client = await connect();
  const res = await emitWithAck(client, 'join', { room: 'general', nickname: '  ' });
  assert.equal(res.ok, false);
  assert.match(res.error, /昵称/);
  client.close();
});

test('broadcasts a message to everyone in the room', async () => {
  const alice = await connect();
  const bob = await connect();

  const aliceJoined = await emitWithAck(alice, 'join', { room: 'room-a', nickname: 'Alice' });
  assert.equal(aliceJoined.ok, true);

  await emitWithAck(bob, 'join', { room: 'room-b', nickname: 'Bob' });
  const bobJoined = await emitWithAck(bob, 'join', { room: 'room-a', nickname: 'Bob' });
  assert.equal(bobJoined.ok, true);

  const received = once(bob, 'message');
  const ack = await emitWithAck(alice, 'message', { text: 'hello bob' });
  assert.equal(ack.ok, true);

  const message = await received;
  assert.equal(message.nickname, 'Alice');
  assert.equal(message.text, 'hello bob');
  assert.equal(message.room, 'room-a');

  alice.close();
  bob.close();
});

test('late joiners receive recent history and presence', async () => {
  const early = await connect();
  await emitWithAck(early, 'join', { room: 'history', nickname: 'Early' });
  await emitWithAck(early, 'message', { text: 'first' });
  await emitWithAck(early, 'message', { text: 'second' });

  const late = await connect();
  const joined = await emitWithAck(late, 'join', { room: 'history', nickname: 'Late' });

  assert.equal(joined.ok, true);
  assert.deepEqual(
    joined.history.map((m) => m.text),
    ['first', 'second'],
  );
  assert.deepEqual(joined.users.sort(), ['Early', 'Late']);

  early.close();
  late.close();
});

test('rejects empty messages', async () => {
  const client = await connect();
  await emitWithAck(client, 'join', { room: 'empty', nickname: 'Tester' });
  const res = await emitWithAck(client, 'message', { text: '   ' });
  assert.equal(res.ok, false);
  client.close();
});

test('notifies the room when a user leaves', async () => {
  const stay = await connect();
  const go = await connect();
  await emitWithAck(stay, 'join', { room: 'leave-test', nickname: 'Stay' });
  await emitWithAck(go, 'join', { room: 'leave-test', nickname: 'Go' });

  const systemEvent = waitForSystem(stay, 'leave');
  go.disconnect();
  const event = await systemEvent;
  assert.equal(event.type, 'leave');
  assert.match(event.text, /Go/);

  stay.close();
});
