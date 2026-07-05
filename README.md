# Navo IM 专业版 (NavoIM Professional Edition)

下一代实时通讯平台，支持 Web、AI 集成、WebRTC 音视频通话与端到端加密（E2EE）。

**当前版本：1.0.0 专业版**

## 功能特性

- 实时消息（WebSocket + 离线增量同步）
- 私聊、群聊、频道
- AI 助手集成
- WebRTC 语音/视频通话（SFU）
- 端到端加密（E2EE）
- 管理后台（用户、组织、敏感词、推送等）
- 多语言（中文 / English / 日本語）

## 技术栈

| 包 | 路径 | 说明 |
|---|---|---|
| `@navo/shared` | `shared/` | 共享类型与 i18n |
| `@navo/server` | `server/` | Express + WebSocket + MySQL + Redis |
| `@navo/web` | `web/` | React + Vite + Tailwind + Zustand |

## 快速开始

### 环境要求

- Node.js 20+
- MySQL 8+
- Redis 6+

### 安装与配置

```bash
git clone https://github.com/aijianai/NavoIM.git
cd NavoIM
npm install
cp .env.example .env
```

编辑 `.env`，填写以下必填项：

| 变量 | 说明 |
|---|---|
| `JWT_SECRET` | JWT 签名密钥（自行生成随机字符串） |
| `AI_API_KEY` | AI 接口密钥 |
| `PUBLIC_BASE_URL` | 服务对外 URL |
| `MYSQL_PASSWORD` | MySQL 密码 |

### 开发

```bash
npm run dev          # 同时启动 server (8080) 与 web (5173)
npm run dev:server   # 仅 server
npm run dev:web      # 仅 web
```

开发模式下 Vite 将 `/api`、`/uploads`、`/ws` 代理到 `http://127.0.0.1:4000`。请确保 `.env` 中 `PORT=4000`，或修改 `web/vite.config.ts` 中的代理目标与 server 端口一致。

### 构建

```bash
npm run build      # shared → server → web（顺序不可变）
npm run typecheck  # TypeScript 类型检查
npm run start      # 生产模式启动 server
```

## 项目结构

```
NavoIM/
├── shared/          # 共享类型
├── server/          # 后端 API + WebSocket + SFU
├── web/             # 前端 React 应用
├── docs-src/        # 模块文档（开发参考）
└── tests/           # 服务端测试
```

## 发布说明

完整变更记录见 [CHANGELOG.md](./CHANGELOG.md)。

## 许可证

专有软件 — NavoIM 专业版。未经授权不得复制、分发或用于商业用途。
