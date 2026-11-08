'use strict';

(() => {
  const socket = io({ autoConnect: true });

  const els = {
    login: document.getElementById('login'),
    loginForm: document.getElementById('login-form'),
    nickname: document.getElementById('nickname'),
    room: document.getElementById('room'),
    passwordField: document.getElementById('password-field'),
    password: document.getElementById('chat-password'),
    loginError: document.getElementById('login-error'),
    enterBtn: document.getElementById('enter-btn'),
    app: document.getElementById('app'),
    roomName: document.getElementById('room-name'),
    chatTitle: document.getElementById('chat-title'),
    userCount: document.getElementById('user-count'),
    userList: document.getElementById('user-list'),
    messages: document.getElementById('messages'),
    typing: document.getElementById('typing'),
    messageForm: document.getElementById('message-form'),
    messageInput: document.getElementById('message-input'),
    connection: document.getElementById('connection'),
    leaveBtn: document.getElementById('leave-btn'),
  };

  const state = {
    nickname: '',
    room: '',
    password: '',
    authRequired: false,
    typingUsers: new Map(),
    typingTimers: new Map(),
    typingTimer: null,
    connected: false,
  };

  const AVATAR_COLORS = [
    '#4f8cff', '#7c5cff', '#ff6b9d', '#ffa94d', '#37d67a',
    '#22b8cf', '#f06595', '#845ef7', '#f59f00', '#20c997',
  ];

  function colorFor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) {
      hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    }
    return AVATAR_COLORS[hash % AVATAR_COLORS.length];
  }

  function initial(name) {
    return name.trim().charAt(0).toUpperCase() || '?';
  }

  function formatTime(ts) {
    return new Date(ts).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function avatar(name) {
    const span = document.createElement('span');
    span.className = 'avatar';
    span.style.background = colorFor(name);
    span.textContent = initial(name);
    return span;
  }

  function scrollToBottom() {
    els.messages.scrollTop = els.messages.scrollHeight;
  }

  function setConnection(online) {
    state.connected = online;
    els.connection.textContent = online ? '已连接' : '已断开';
    els.connection.className = `status ${online ? 'online' : 'offline'}`;
  }

  function renderMessage(message) {
    const own = message.nickname === state.nickname;
    const row = document.createElement('div');
    row.className = `msg${own ? ' own' : ''}`;

    row.appendChild(avatar(message.nickname));

    const body = document.createElement('div');
    body.className = 'body';

    const meta = document.createElement('div');
    meta.className = 'meta';

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = own ? '我' : message.nickname;
    name.style.color = own ? 'var(--accent)' : colorFor(message.nickname);

    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = formatTime(message.ts);

    meta.append(name, time);

    const text = document.createElement('div');
    text.className = 'text';
    text.textContent = message.text;

    body.append(meta, text);
    row.appendChild(body);
    els.messages.appendChild(row);
    scrollToBottom();
  }

  function renderSystem(payload) {
    const row = document.createElement('div');
    row.className = 'msg system';

    const text = document.createElement('div');
    text.className = 'text';
    text.textContent = payload.text;

    row.appendChild(text);
    els.messages.appendChild(row);
    scrollToBottom();
  }

  function renderUsers(users) {
    els.userList.textContent = '';
    els.userCount.textContent = String(users.length);
    for (const name of users) {
      const li = document.createElement('li');
      li.appendChild(avatar(name));
      const label = document.createElement('span');
      label.textContent = name === state.nickname ? `${name}（我）` : name;
      li.appendChild(label);
      els.userList.appendChild(li);
    }
  }

  function renderTyping() {
    const names = [...state.typingUsers.keys()].filter((n) => n !== state.nickname);
    els.typing.textContent = names.length
      ? `${names.join('、')} 正在输入...`
      : '';
  }

  function clearTyping(name) {
    state.typingUsers.delete(name);
    renderTyping();
  }

  function enterRoom(nickname, room) {
    state.nickname = nickname;
    state.room = room;
    els.roomName.textContent = room;
    els.chatTitle.textContent = room;
    els.login.classList.add('hidden');
    els.app.classList.remove('hidden');
    els.messages.textContent = '';
    els.messageInput.focus();
  }

  function resetToLogin(message) {
    state.room = '';
    els.app.classList.add('hidden');
    els.login.classList.remove('hidden');
    els.loginError.textContent = message || '';
    els.messages.textContent = '';
    els.messageInput.value = '';
  }

  function sendJoin(nickname, room, password) {
    state.password = password || '';
    socket.emit('join', { nickname, room, password: state.password }, (res) => {
      if (!res || !res.ok) {
        const message = (res && res.error) || '加入房间失败';
        els.enterBtn.disabled = false;
        if (state.room) {
          resetToLogin(message);
        } else {
          els.loginError.textContent = message;
          if (res && res.code === 'BAD_PASSWORD') {
            els.password.focus();
            els.password.select();
          }
        }
        return;
      }
      els.loginError.textContent = '';
      els.enterBtn.disabled = false;
      enterRoom(res.nickname, res.room);
      els.messages.textContent = '';
      (res.history || []).forEach(renderMessage);
      renderUsers(res.users || []);
      scrollToBottom();
    });
  }

  // ---------- Login ----------
  const savedNickname = localStorage.getItem('chat:nickname');
  const savedRoom = localStorage.getItem('chat:room');
  if (savedNickname) els.nickname.value = savedNickname;
  if (savedRoom) els.room.value = savedRoom;

  els.loginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const nickname = els.nickname.value.trim();
    const room = els.room.value.trim();
    const password = els.password.value;
    if (!nickname) {
      els.loginError.textContent = '请输入昵称';
      return;
    }
    if (!room) {
      els.loginError.textContent = '请输入房间名';
      return;
    }
    if (state.authRequired && !password) {
      els.loginError.textContent = '请输入访问密码';
      els.password.focus();
      return;
    }
    localStorage.setItem('chat:nickname', nickname);
    localStorage.setItem('chat:room', room);

    els.loginError.textContent = '';
    els.enterBtn.disabled = true;

    if (socket.connected) sendJoin(nickname, room, password);
    else {
      socket.once('connect', () => sendJoin(nickname, room, password));
      socket.connect();
    }
  });

  fetch('/api/config')
    .then((res) => res.json())
    .then((cfg) => {
      state.authRequired = Boolean(cfg && cfg.authRequired);
      if (state.authRequired) els.passwordField.classList.remove('hidden');
      if (cfg && cfg.limits) {
        if (cfg.limits.nickname) els.nickname.maxLength = cfg.limits.nickname;
        if (cfg.limits.room) els.room.maxLength = cfg.limits.room;
        if (cfg.limits.message) els.messageInput.maxLength = cfg.limits.message;
      }
    })
    .catch(() => {});

  // ---------- Messages ----------
  els.messageForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = els.messageInput.value.trim();
    if (!text) return;

    socket.emit('message', { text }, (res) => {
      if (!res || !res.ok) {
        if (res && res.error) {
          els.typing.textContent = res.error;
          setTimeout(() => renderTyping(), 2500);
        }
        return;
      }
      els.messageInput.value = '';
      socket.emit('typing', { typing: false });
    });
  });

  els.messageInput.addEventListener('input', () => {
    socket.emit('typing', { typing: true });
    clearTimeout(state.typingTimer);
    state.typingTimer = setTimeout(() => {
      socket.emit('typing', { typing: false });
    }, 1500);
  });

  els.leaveBtn.addEventListener('click', () => {
    if (!state.room) return;
    socket.emit('typing', { typing: false });
    socket.disconnect();
    resetToLogin('');
    setTimeout(() => socket.connect(), 300);
  });

  // ---------- Socket events ----------
  socket.on('connect', () => {
    setConnection(true);
  });

  socket.on('disconnect', () => {
    setConnection(false);
    if (state.room) {
      els.typing.textContent = '连接已断开，正在重连...';
    }
  });

  socket.io.on('reconnect', () => {
    if (state.room) sendJoin(state.nickname, state.room, state.password);
  });

  socket.on('rejected', (payload) => {
    resetToLogin((payload && payload.reason) || '无法连接到聊天室');
  });

  socket.on('message', (message) => {
    if (!state.room) return;
    renderMessage(message);
  });

  socket.on('system', (payload) => {
    if (!state.room) return;
    renderSystem(payload);
  });

  socket.on('presence', (payload) => {
    if (!state.room) return;
    renderUsers(payload.users || []);
    for (const name of state.typingUsers.keys()) {
      if (!payload.users.includes(name)) clearTyping(name);
    }
  });

  socket.on('typing', (payload) => {
    if (!state.room) return;
    if (payload.typing) {
      state.typingUsers.set(payload.nickname, Date.now());
      renderTyping();
      clearTimeout(state.typingTimers.get(payload.nickname));
      const timer = setTimeout(() => clearTyping(payload.nickname), 4000);
      state.typingTimers.set(payload.nickname, timer);
    } else {
      clearTimeout(state.typingTimers.get(payload.nickname));
      state.typingTimers.delete(payload.nickname);
      clearTyping(payload.nickname);
    }
  });
})();
