'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { io: createClient } = require('socket.io-client');
const { createChatServer } = require('../src/app');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, timeoutMs = 1500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(20);
  }
  return false;
}

async function startServer(overrides = {}) {
  const chat = createChatServer(overrides);
  await new Promise((resolve) => chat.server.listen(0, resolve));
  const { port } = chat.server.address();
  return {
    ...chat,
    url: `http://localhost:${port}`,
    close: async () => {
      await new Promise((resolve) => chat.server.close(resolve));
    },
  };
}

let server;
let url;

before(async () => {
  server = await startServer();
  url = server.url;
});

after(async () => {
  await server.close();
});

function connect(target = url) {
  return new Promise((resolve, reject) => {
    const client = createClient(target, { transports: ['websocket'], forceNew: true });
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

test('config endpoint reports auth and limits', async () => {
  const res = await fetch(`${url}/api/config`);
  const body = await res.json();
  assert.equal(body.authRequired, false);
  assert.equal(body.limits.message, 2000);
  assert.equal(body.limits.nickname, 24);
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

test('rejects a duplicate nickname in the same room', async () => {
  const first = await connect();
  const second = await connect();
  await emitWithAck(first, 'join', { room: 'unique-name', nickname: 'Same' });

  const res = await emitWithAck(second, 'join', { room: 'unique-name', nickname: 'Same' });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'NICKNAME_TAKEN');

  first.close();
  second.close();
});

test('allows the same nickname in different rooms', async () => {
  const a = await connect();
  const b = await connect();
  const joinedA = await emitWithAck(a, 'join', { room: 'names-a', nickname: 'Same' });
  const joinedB = await emitWithAck(b, 'join', { room: 'names-b', nickname: 'Same' });

  assert.equal(joinedA.ok, true);
  assert.equal(joinedB.ok, true);

  a.close();
  b.close();
});

test('forwards typing to other room members only', async () => {
  const sender = await connect();
  const peer = await connect();
  await emitWithAck(sender, 'join', { room: 'typing-room', nickname: 'Sender' });
  await emitWithAck(peer, 'join', { room: 'typing-room', nickname: 'Peer' });

  const received = once(peer, 'typing');
  sender.emit('typing', { typing: true });

  const event = await received;
  assert.equal(event.nickname, 'Sender');
  assert.equal(event.typing, true);

  sender.close();
  peer.close();
});

test('rate limits messages per socket', async () => {
  const limited = await startServer({
    rateLimit: { messages: { windowMs: 60000, maxMessages: 2 } },
  });
  try {
    const client = await connect(limited.url);
    await emitWithAck(client, 'join', { room: 'limit', nickname: 'Fast' });

    const first = await emitWithAck(client, 'message', { text: '1' });
    const second = await emitWithAck(client, 'message', { text: '2' });
    const third = await emitWithAck(client, 'message', { text: '3' });

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(third.ok, false);
    assert.match(third.error, /太快/);

    client.close();
  } finally {
    await limited.close();
  }
});

test('requires the configured access password', async () => {
  const secured = await startServer({ password: 's3cret' });
  try {
    const client = await connect(secured.url);

    const wrong = await emitWithAck(client, 'join', {
      room: 'secret',
      nickname: 'Guest',
      password: 'nope',
    });
    assert.equal(wrong.ok, false);
    assert.equal(wrong.code, 'BAD_PASSWORD');

    const missing = await emitWithAck(client, 'join', { room: 'secret', nickname: 'Guest' });
    assert.equal(missing.ok, false);
    assert.equal(missing.code, 'BAD_PASSWORD');

    const correct = await emitWithAck(client, 'join', {
      room: 'secret',
      nickname: 'Guest',
      password: 's3cret',
    });
    assert.equal(correct.ok, true);

    client.close();
  } finally {
    await secured.close();
  }
});

test('enforces the per-room user limit', async () => {
  const small = await startServer({ limits: { usersPerRoom: 2 } });
  try {
    const a = await connect(small.url);
    const b = await connect(small.url);
    const c = await connect(small.url);
    await emitWithAck(a, 'join', { room: 'two', nickname: 'A' });
    await emitWithAck(b, 'join', { room: 'two', nickname: 'B' });

    const res = await emitWithAck(c, 'join', { room: 'two', nickname: 'C' });
    assert.equal(res.ok, false);
    assert.equal(res.code, 'ROOM_FULL');

    a.close();
    b.close();
    c.close();
  } finally {
    await small.close();
  }
});

test('evicts an idle room when the room limit is reached', async () => {
  const capped = await startServer({ limits: { rooms: 1 } });
  try {
    const first = await connect(capped.url);
    await emitWithAck(first, 'join', { room: 'r1', nickname: 'First' });
    await emitWithAck(first, 'message', { text: 'leaves history behind' });
    first.disconnect();
    await waitFor(() => capped.store.users('r1').length === 0);

    const second = await connect(capped.url);
    const res = await emitWithAck(second, 'join', { room: 'r2', nickname: 'Second' });
    assert.equal(res.ok, true);
    assert.equal(capped.store.has('r1'), false);
    assert.equal(capped.store.has('r2'), true);

    second.close();
  } finally {
    await capped.close();
  }
});
