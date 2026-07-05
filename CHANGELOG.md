# Changelog

All notable changes to Navo IM 专业版 (NavoIM Professional Edition) are documented in this file.

## [1.0.0] - 2026-07-05

### 专业版首发

NavoIM 专业版首个公开发布版本。

### Added

- 离线消息增量同步模块（`message-sync.ts`）：检测本地缓存与服务器 `lastMessageId` 不一致时自动补齐
- WebSocket 重连后批量同步所有过期会话（优先未读会话，并发上限 4 路）
- 打开会话时若缓存过期则后台增量拉取，避免「列表有最新消息、点进会话却消失」
- GitHub 发布文档：`README.md`、`CHANGELOG.md`

### Fixed

- 修复 IndexedDB 本地缓存与 `lastMessages` 预览不一致导致的消息缺失问题
- 修复空数组缓存（`[]`）阻止重新拉取消息的边界情况

### Removed

- 移除 Android / Capacitor / APK 构建与 `platform` 抽象层，改为 Web 专用 `lib/` 模块（`browser`、`camera`、`download`、`notification`、`app-state`）
- 脱敏 `.env.example` 与源码中的生产环境默认配置

### Technical

- `ChatView` 使用 `needsMessageSync` + `syncConversationMessages` 替代简单的缓存存在性检查
- `App.tsx` 使用 `catchUpStaleConversations` 替代仅同步当前选中会话的策略

## [0.1.0] - 内部开发版

- 初始 monorepo 结构：shared / server / web
- 实时消息、AI、WebRTC、E2EE、管理后台等核心功能
