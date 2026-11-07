# 实时聊天室 (Realtime Chat)

一个基于 **Node.js + Express + Socket.IO** 的实时聊天应用，支持多房间、在线成员列表、输入状态提示和历史消息。

## 功能特性

- 实时消息收发（WebSocket，失败时自动降级为轮询）
- 多房间：不同房间的消息互相隔离
- 在线成员列表实时更新（加入 / 离开）
- 「正在输入」状态提示
- 最近消息历史（默认每房间保留 100 条，新成员加入即可看到）
- 昵称、房间名、消息内容校验与发送频率限制
- 断线自动重连，并自动重新加入原房间
- 响应式界面，适配桌面与手机
- 前端使用 `textContent` 渲染，避免 XSS

## 技术栈

| 层 | 技术 |
| --- | --- |
| 服务端 | Node.js、Express、Socket.IO |
| 客户端 | 原生 HTML / CSS / JavaScript、Socket.IO Client |
| 测试 | Node.js 内置测试运行器 + socket.io-client |

## 快速开始

需要 Node.js 18 及以上版本。

```bash
npm install
npm start
```

打开 http://localhost:3000 ，输入昵称和房间名即可开始聊天。
打开多个浏览器标签页（或不同设备）访问同一房间，即可体验实时聊天。

开发模式（文件改动自动重启）：

```bash
npm run dev
```

运行测试：

```bash
npm test
```

## 使用 Docker

```bash
docker build -t realtime-chat .
docker run -p 3000:3000 realtime-chat
```

## 项目结构

```
chat/
├── server.js              # 启动入口
├── src/
│   ├── app.js             # 创建 Express + Socket.IO 服务
│   ├── config.js          # 端口、长度限制、频率限制等配置
│   ├── rooms.js           # 房间与消息历史（内存存储）
│   └── sockets.js         # Socket 事件处理与校验
├── public/
│   ├── index.html         # 页面结构
│   ├── css/style.css      # 样式
│   └── js/app.js          # 前端逻辑
├── test/chat.test.js      # 端到端测试
├── Dockerfile
└── package.json
```

## Socket 事件说明

### 客户端 -> 服务端

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `join` | `{ nickname, room }` | 加入房间，回调返回 `{ ok, room, nickname, history, users }` |
| `message` | `{ text }` | 发送消息，回调返回 `{ ok, message }` 或 `{ ok: false, error }` |
| `typing` | `{ typing: boolean }` | 广播自己的输入状态 |

### 服务端 -> 客户端

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `message` | `{ id, room, nickname, text, ts }` | 新消息 |
| `presence` | `{ room, users }` | 在线成员变化 |
| `system` | `{ id, room, type, text, ts }` | 系统提示（加入 / 离开） |
| `typing` | `{ room, nickname, typing }` | 他人的输入状态 |

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 监听端口 |
| `MAX_HISTORY` | `100` | 每个房间保留的历史消息条数 |

## 说明

- 消息存储在内存中，服务重启后会清空。如需持久化，可将 `src/rooms.js` 替换为 Redis / 数据库实现。
- 生产环境建议在反向代理（Nginx / Caddy）后运行，并配置 HTTPS 与 WebSocket 转发。

## License

MIT
