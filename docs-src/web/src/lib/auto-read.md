# auto-read.ts — 自动已读定时器（Navo助手专用）

## Purpose

管理用户向Navo助手发送消息后的自动已读定时器。仅在用户向Navo助手会话发送消息时启动300毫秒定时器，触发后将用户发送的该条消息标记为已读状态。普通用户间对话、群组消息不触发此逻辑。

## Exports

| Export | Kind | Description |
|--------|------|-------------|
| `startAutoReadTimer(conversationId, messageId, messageKind, authorId)` | Function | 启动自动已读定时器（需通过身份校验） |
| `cancelAutoReadTimer(conversationId)` | Function | 取消指定会话的自动已读定时器 |
| `cancelAllAutoReadTimers()` | Function | 取消所有活跃的自动已读定时器 |
| `hasActiveAutoReadTimer(conversationId)` | Function | 检查指定会话是否有活跃的定时器 |

## Key Logic

**身份校验。** `startAutoReadTimer` 执行四重校验，全部通过才启动定时器：
1. 用户已登录（`me` 存在）
2. 发送者为当前用户（`authorId === me.id`）
3. 会话为Navo助手会话（`conv.memberIds` 包含 `AI_USER_ID`）
4. 消息类型为用户可发送的文本/媒体类型（text/image/file/voice/location/sticker/forwardedCard/friendCard/channelCard/poll/ai）

**排除场景。** 以下消息类型不触发自动已读：
- 系统消息（system）
- 通话信令消息（call）
- 服务端推送的事件消息
- 非当前用户发送的消息

**定时器生命周期。** 每个会话维护一个独立的300毫秒定时器。定时器启动后，如果用户在触发前切换到其他会话，定时器会被取消。

**触发操作。** 定时器触发时：
1. 验证会话仍为当前活跃会话（`selectedId === conversationId`）
2. 通过WebSocket发送`read`事件到服务器，标记指定消息为已读
3. 更新本地`readMarkers`状态
4. 持久化到localStorage

## Dependencies

| Import | Purpose |
|--------|---------|
| `@navo/shared` | `AI_USER_ID` 常量，用于识别Navo助手 |
| `./store` | 读取当前会话状态，更新readMarkers |

## Constraints and Gotchas

- `activeTimers`是模块级Map，不在store中，避免序列化问题
- 普通用户间对话、群组消息不会触发自动已读，维持现有手动/滚动触发机制
- 切换会话时必须调用`cancelAutoReadTimer`取消上一个会话的定时器
- 重置状态时必须调用`cancelAllAutoReadTimers`清理所有定时器

## Interactions

- **Composer.tsx:** 所有发送消息的函数在发送后调用`startAutoReadTimer`，传入完整的身份信息
- **store.ts:** `selectConversation`调用`cancelAutoReadTimer`取消切换前会话的定时器；`reset`调用`cancelAllAutoReadTimers`清理
- **ws-client.ts:** 定时器触发时通过`wsClient.send`发送`read`事件
