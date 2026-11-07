# 使用指南

本文档介绍如何安装、运行、使用和部署「实时聊天室」。

## 目录

1. [环境要求](#1-环境要求)
2. [安装](#2-安装)
3. [启动服务](#3-启动服务)
4. [界面使用说明](#4-界面使用说明)
5. [多用户 / 多设备测试](#5-多用户--多设备测试)
6. [配置项](#6-配置项)
7. [使用 Docker 运行](#7-使用-docker-运行)
8. [生产环境部署](#8-生产环境部署)
9. [二次开发](#9-二次开发)
10. [常见问题](#10-常见问题)

---

## 1. 环境要求

- Node.js **18 或更高版本**（推荐 20 LTS）
- npm（随 Node.js 一起安装）
- 现代浏览器（Chrome、Edge、Firefox、Safari）

检查版本：

```bash
node -v
npm -v
```

## 2. 安装

进入项目目录并安装依赖：

```bash
cd chat
npm install
```

安装完成后会生成 `node_modules/` 目录。

## 3. 启动服务

开发或本地体验：

```bash
npm start
```

看到下面的输出说明启动成功：

```
实时聊天服务已启动: http://localhost:3000
```

在浏览器打开：<http://localhost:3000>

开发模式（修改代码后自动重启）：

```bash
npm run dev
```

运行自动化测试：

```bash
npm test
```

预期结果：`# pass 6`。

## 4. 界面使用说明

### 4.1 进入聊天室

打开页面后，在登录卡片中填写：

| 字段 | 说明 | 示例 |
| --- | --- | --- |
| 昵称 | 你在聊天室中显示的名字，最多 24 个字符 | 小明 |
| 房间 | 房间名称，最多 40 个字符；相同房间的人互相可见 | general |

点击「进入聊天室」。昵称和房间会保存在浏览器本地，下次打开自动填充。

### 4.2 发送消息

- 在底部输入框输入内容，按 **回车** 或点击「发送」。
- 消息会实时出现在同一房间所有人的屏幕上。
- 单条消息最多 2000 个字符。
- 为避免刷屏，连续发送有频率限制：**5 秒内最多 20 条**。

### 4.3 查看在线成员

左侧边栏会显示当前房间的在线成员及人数，成员加入 / 离开时：

- 成员列表实时更新
- 聊天区出现系统提示（如「小明 加入了聊天室」）

### 4.4 正在输入提示

当你在输入框打字时，同房间其他人会看到「小明 正在输入...」；停止输入约 1.5 秒后提示消失。

### 4.5 切换 / 退出房间

- 点击左下角「退出房间」会断开连接并返回登录页。
- 想换房间：退出后重新输入新的房间名进入即可。
- 在同一个页面重新进入其他房间也可以，服务端会自动让你离开旧房间。

### 4.6 断线重连

网络短暂中断时，右上角状态会显示「已断开」，恢复后自动重连并重新加入原房间，历史消息会重新加载。

## 5. 多用户 / 多设备测试

简单的本地测试方式：

1. 打开两个浏览器标签页，访问 <http://localhost:3000>。
2. 使用不同的昵称，填入**相同房间名**，分别进入。
3. 在任意一个标签页发送消息，另一个标签页会立即收到。
4. 左侧成员列表应显示两个人。

如果使用不同房间名，两个标签页的消息互相隔离，可用于验证房间隔离。

局域网其他设备访问：把地址中的 `localhost` 换成运行服务电脑的局域网 IP，例如 `http://192.168.1.10:3000`，并确保防火墙放行 3000 端口。

## 6. 配置项

通过环境变量配置：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 服务监听端口 |
| `MAX_HISTORY` | `100` | 每个房间保留的历史消息条数 |

示例：

```bash
PORT=8080 MAX_HISTORY=200 npm start
```

对应代码位于 `src/config.js`，消息长度、频率限制等也可在此调整。

## 7. 使用 Docker 运行

构建镜像：

```bash
docker build -t realtime-chat .
```

运行容器：

```bash
docker run -d --name chat -p 3000:3000 realtime-chat
```

访问 <http://localhost:3000>。

自定义端口与历史条数：

```bash
docker run -d --name chat -p 8080:3000 -e MAX_HISTORY=200 realtime-chat
```

查看日志、停止和删除：

```bash
docker logs -f chat
docker stop chat
docker rm chat
```

## 8. 生产环境部署

### 8.1 使用 PM2 守护进程

```bash
npm install -g pm2
pm2 start server.js --name realtime-chat
pm2 save
pm2 startup
```

### 8.2 Nginx 反向代理（含 WebSocket）

```nginx
server {
    listen 80;
    server_name chat.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

> 关键是 `Upgrade` 和 `Connection` 两个请求头，否则 WebSocket 无法正常工作。

配置 HTTPS 时推荐使用 Caddy 或 Certbot，页面与 WebSocket 需同为 `https` / `wss`。

### 8.3 注意事项

- 当前消息存储**在内存中**，服务重启后历史消息会清空。
- 如需多实例部署，必须接入共享存储（如 Redis）做 Socket.IO 适配器，否则不同实例的用户看不到彼此消息。
- 如需持久化消息，可改造 `src/rooms.js`，把内存读写替换为数据库。

## 9. 二次开发

### 9.1 目录说明

| 路径 | 作用 |
| --- | --- |
| `server.js` | 启动入口，监听端口、处理退出信号 |
| `src/app.js` | 创建 Express 应用、HTTP 服务与 Socket.IO |
| `src/config.js` | 全局配置（端口、长度、频率限制） |
| `src/rooms.js` | 房间、成员与历史消息的内存存储 |
| `src/sockets.js` | 所有 Socket 事件的校验与处理 |
| `public/` | 前端页面、样式和脚本 |
| `test/chat.test.js` | 基于 Node 内置测试框架的端到端测试 |

### 9.2 自定义事件

服务端在 `src/sockets.js` 中注册事件，前端在 `public/js/app.js` 中监听。事件列表见 [README](../README.md#socket-事件说明)。

例如新增「撤回消息」：在 `sockets.js` 中监听 `message:recall`，删除历史并广播；前端收到后移除对应 DOM 节点。

### 9.3 修改样式

所有样式在 `public/css/style.css`，通过开头的 `:root` CSS 变量可快速换主题：

```css
:root {
  --accent: #4f8cff;   /* 主色 */
  --accent-2: #7c5cff; /* 渐变色 */
  --bg: #0b1020;       /* 背景 */
}
```

## 10. 常见问题

**Q：页面一直显示「已断开」？**
A：确认服务已启动、端口正确；若通过 Nginx 访问，检查是否配置了 WebSocket 的 `Upgrade` 头。

**Q：两个标签页互相收不到消息？**
A：确认房间名完全一致（区分大小写、前后空格会被去除）；确认没有使用浏览器隐私模式导致连接异常。

**Q：换端口后打不开？**
A：访问地址要同步改成新端口，例如 `PORT=8080 npm start` 后访问 `http://localhost:8080`。

**Q：重启后消息不见了？**
A：历史消息默认保存在内存中，重启即清空，属于预期行为。需要持久化请接入数据库/Redis。

**Q：提示「发送太快了」？**
A：触发了频率限制（5 秒 20 条），稍等再发即可。

**Q：如何修改房间名长度 / 消息长度限制？**
A：修改 `src/config.js` 中的 `limits`，重启服务生效。

**Q：如何修改默认端口？**
A：使用环境变量 `PORT`，或在 `src/config.js` 中修改 `port` 的默认值。
