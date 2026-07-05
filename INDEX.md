# Navo IM 项目索引

## 项目概述

**项目名称**: Navo IM (navo-im)
**版本**: 0.1.0
**描述**: 下一代 IM 聊天软件
**技术栈**: TypeScript, React 18, Vite, Tailwind CSS, Express, WebSocket, MySQL, Redis
**最后更新**: 2026/6/27
**索引版本**: 1.0.0
**文件数量**: 85 个核心源码文件

## 目录结构

```
www/study_tool/
├── server/
│   ├── src/
│   │   ├── types/
│   │   │   ├── webrtc.d.ts
│   │   │   └── wrtc.d.ts
│   │   ├── admin-routes.ts
│   │   ├── admin.ts
│   │   ├── ai.ts
│   │   ├── audit.ts
│   │   ├── auth.ts
│   │   ├── config.ts
│   │   ├── db-child.js
│   │   ├── db-worker.js
│   │   ├── db.ts
│   │   ├── email.ts
│   │   ├── http.ts
│   │   ├── index.ts
│   │   ├── redis.ts
│   │   ├── sfu.ts
│   │   ├── store.ts
│   │   ├── verification.ts
│   │   └── ws.ts
│   ├── .env.d.ts
│   ├── package.json
│   └── tsconfig.json
├── shared/
│   ├── src/
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
├── web/
│   ├── public/
│   │   ├── emoji/
│   │   │   └── manifest.json
│   ├── src/
│   │   ├── components/
│   │   │   ├── AdminPanel.tsx
│   │   │   ├── AppShell.tsx
│   │   │   ├── Avatar.tsx
│   │   │   ├── CallView.tsx
│   │   │   ├── ChannelManage.tsx
│   │   │   ├── ChatView.tsx
│   │   │   ├── Composer.tsx
│   │   │   ├── ConfirmModal.tsx
│   │   │   ├── CreateChannelModal.tsx
│   │   │   ├── EmojiText.tsx
│   │   │   ├── ErrorBoundary.tsx
│   │   │   ├── FriendsView.tsx
│   │   │   ├── ImageViewer.tsx
│   │   │   ├── LocationPicker.tsx
│   │   │   ├── LocationPickerHost.tsx
│   │   │   ├── LocationViewer.tsx
│   │   │   ├── Login.tsx
│   │   │   ├── Markdown.tsx
│   │   │   ├── MediaBrowser.tsx
│   │   │   ├── MemberPanel.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── MessageSearch.tsx
│   │   │   ├── MobileShell.tsx
│   │   │   ├── NotificationBell.tsx
│   │   │   ├── NumberPadInput.tsx
│   │   │   ├── PatternLockInput.tsx
│   │   │   ├── ProfileSettings.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── StatusPicker.tsx
│   │   │   ├── Toast.tsx
│   │   │   ├── TypingIndicator.tsx
│   │   │   ├── UserCard.tsx
│   │   │   ├── UserCardPopover.tsx
│   │   │   └── VideoViewer.tsx
│   │   ├── lib/
│   │   │   ├── api.ts
│   │   │   ├── call.ts
│   │   │   ├── captcha-config.ts
│   │   │   ├── cn.ts
│   │   │   ├── location-picker.ts
│   │   │   ├── sound.ts
│   │   │   ├── store.ts
│   │   │   ├── ui.ts
│   │   │   ├── useIsMobile.ts
│   │   │   ├── utils.ts
│   │   │   ├── viewer.ts
│   │   │   └── ws-client.ts
│   │   ├── App.tsx
│   │   ├── global.d.ts
│   │   ├── main.tsx
│   │   └── styles.css
│   ├── index.html
│   ├── package.json
│   ├── postcss.config.js
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── vite.config.ts
├── AI_INDEX_GUIDE.md
├── generate-index.js
├── index-config.json
├── INDEX.md
├── package.json
```

## 核心文件索引

### .

| 文件 | 大小 | 类型 | 最后修改 |
|------|------|------|----------|
| .env.example | 1.1 KB | Unknown | 2026/6/26 |
| .gitignore | 313 B | Unknown | 2026/6/21 |
| package.json | 685 B | JSON | 2026/6/21 |
| test_sfu.py | 33.7 KB | Python | 2026/6/21 |

### web

| 文件 | 大小 | 类型 | 最后修改 |
|------|------|------|----------|
| index.html | 1 KB | HTML | 2026/6/21 |
| package.json | 723 B | JSON | 2026/6/21 |
| postcss.config.js | 81 B | JavaScript | 2026/6/21 |
| tailwind.config.js | 4.8 KB | JavaScript | 2026/6/21 |
| tsconfig.json | 718 B | JSON | 2026/6/21 |
| vite.config.ts | 591 B | TypeScript | 2026/6/21 |

### server

| 文件 | 大小 | 类型 | 最后修改 |
|------|------|------|----------|
| package.json | 1 KB | JSON | 2026/6/26 |
| tsconfig.json | 512 B | JSON | 2026/6/21 |

### shared

| 文件 | 大小 | 类型 | 最后修改 |
|------|------|------|----------|
| package.json | 415 B | JSON | 2026/6/21 |
| tsconfig.json | 329 B | JSON | 2026/6/21 |

### shared/src

| 文件 | 大小 | 类型 | 最后修改 |
|------|------|------|----------|
| index.ts | 15.8 KB | TypeScript | 2026/6/26 |

### server/src

| 文件 | 大小 | 类型 | 最后修改 |
|------|------|------|----------|
| admin-routes.ts | 14.3 KB | TypeScript | 2026/6/26 |
| admin.ts | 20.2 KB | TypeScript | 2026/6/26 |
| ai.ts | 5.5 KB | TypeScript | 2026/6/26 |
| audit.ts | 594 B | TypeScript | 2026/6/21 |
| auth.ts | 824 B | TypeScript | 2026/6/21 |
| config.ts | 1.8 KB | TypeScript | 2026/6/26 |
| db-child.js | 1.2 KB | JavaScript | 2026/6/26 |
| db-worker.js | 2.2 KB | JavaScript | 2026/6/26 |
| db.ts | 19.7 KB | TypeScript | 2026/6/26 |
| email.ts | 2.6 KB | TypeScript | 2026/6/26 |
| http.ts | 28.6 KB | TypeScript | 2026/6/26 |
| index.ts | 1.5 KB | TypeScript | 2026/6/21 |
| redis.ts | 2.9 KB | TypeScript | 2026/6/21 |
| sfu.ts | 43.9 KB | TypeScript | 2026/6/21 |
| store.ts | 48.4 KB | TypeScript | 2026/6/26 |
| verification.ts | 1.4 KB | TypeScript | 2026/6/26 |
| ws.ts | 35.3 KB | TypeScript | 2026/6/26 |

### server/src/types

| 文件 | 大小 | 类型 | 最后修改 |
|------|------|------|----------|
| webrtc.d.ts | 2.8 KB | TypeScript | 2026/6/21 |
| wrtc.d.ts | 680 B | TypeScript | 2026/6/21 |

### web/src

| 文件 | 大小 | 类型 | 最后修改 |
|------|------|------|----------|
| App.tsx | 9.3 KB | React TSX | 2026/6/21 |
| global.d.ts | 148 B | TypeScript | 2026/6/21 |
| main.tsx | 242 B | React TSX | 2026/6/21 |
| styles.css | 5.8 KB | CSS | 2026/6/21 |

### web/src/components

| 文件 | 大小 | 类型 | 最后修改 |
|------|------|------|----------|
| AdminPanel.tsx | 71.9 KB | React TSX | 2026/6/21 |
| AppShell.tsx | 10.2 KB | React TSX | 2026/6/21 |
| Avatar.tsx | 2.5 KB | React TSX | 2026/6/21 |
| CallView.tsx | 12.4 KB | React TSX | 2026/6/21 |
| ChannelManage.tsx | 21.3 KB | React TSX | 2026/6/21 |
| ChatView.tsx | 24.8 KB | React TSX | 2026/6/21 |
| Composer.tsx | 47.9 KB | React TSX | 2026/6/21 |
| ConfirmModal.tsx | 4.2 KB | React TSX | 2026/6/21 |
| CreateChannelModal.tsx | 7.7 KB | React TSX | 2026/6/21 |
| EmojiText.tsx | 692 B | React TSX | 2026/6/21 |
| ErrorBoundary.tsx | 1.6 KB | React TSX | 2026/6/21 |
| FriendsView.tsx | 23.1 KB | React TSX | 2026/6/21 |
| ImageViewer.tsx | 3.7 KB | React TSX | 2026/6/21 |
| LocationPicker.tsx | 11.7 KB | React TSX | 2026/6/21 |
| LocationPickerHost.tsx | 3.6 KB | React TSX | 2026/6/21 |
| LocationViewer.tsx | 3.9 KB | React TSX | 2026/6/21 |
| Login.tsx | 24.4 KB | React TSX | 2026/6/26 |
| Markdown.tsx | 12.8 KB | React TSX | 2026/6/21 |
| MediaBrowser.tsx | 14.6 KB | React TSX | 2026/6/26 |
| MemberPanel.tsx | 7.2 KB | React TSX | 2026/6/21 |
| MessageBubble.tsx | 48.4 KB | React TSX | 2026/6/21 |
| MessageSearch.tsx | 10.9 KB | React TSX | 2026/6/26 |
| MobileShell.tsx | 25.6 KB | React TSX | 2026/6/21 |
| NotificationBell.tsx | 5.2 KB | React TSX | 2026/6/21 |
| NumberPadInput.tsx | 6.4 KB | React TSX | 2026/6/21 |
| PatternLockInput.tsx | 10.6 KB | React TSX | 2026/6/21 |
| ProfileSettings.tsx | 22.3 KB | React TSX | 2026/6/26 |
| Sidebar.tsx | 24.4 KB | React TSX | 2026/6/21 |
| StatusPicker.tsx | 1.2 KB | React TSX | 2026/6/21 |
| Toast.tsx | 1 KB | React TSX | 2026/6/21 |
| TypingIndicator.tsx | 1.3 KB | React TSX | 2026/6/21 |
| UserCard.tsx | 9.5 KB | React TSX | 2026/6/21 |
| UserCardPopover.tsx | 610 B | React TSX | 2026/6/21 |
| VideoViewer.tsx | 4.2 KB | React TSX | 2026/6/21 |

### web/src/lib

| 文件 | 大小 | 类型 | 最后修改 |
|------|------|------|----------|
| api.ts | 12.4 KB | TypeScript | 2026/6/26 |
| call.ts | 46.5 KB | TypeScript | 2026/6/21 |
| captcha-config.ts | 782 B | TypeScript | 2026/6/25 |
| cn.ts | 29 B | TypeScript | 2026/6/21 |
| location-picker.ts | 775 B | TypeScript | 2026/6/21 |
| sound.ts | 2.1 KB | TypeScript | 2026/6/21 |
| store.ts | 36.8 KB | TypeScript | 2026/6/26 |
| ui.ts | 1.1 KB | TypeScript | 2026/6/21 |
| useIsMobile.ts | 573 B | TypeScript | 2026/6/21 |
| utils.ts | 10.5 KB | TypeScript | 2026/6/21 |
| viewer.ts | 2 KB | TypeScript | 2026/6/21 |
| ws-client.ts | 7.9 KB | TypeScript | 2026/6/21 |

### web/public/emoji

| 文件 | 大小 | 类型 | 最后修改 |
|------|------|------|----------|
| manifest.json | 11.2 KB | JSON | 2026/6/21 |

## 代码结构摘要

### index.ts

**导出**: ID, ISODate, PresenceStatus, Gender, User, PublicUser, ConversationKind, ChannelRole, SystemRole, AdminPermission, ROLE_PERMISSIONS, AdminUser, AuditLog, SystemSettings, ConversationMember, Conversation, MessageKind, PollOption, PollData, PollVote, PollResult, Attachment, Reaction, Message, ForwardedMessageItem, ForwardedMessage, FriendStatus, Friendship, FriendRequest, BootstrapData, LoginRequest, RegisterRequest, AuthResponse, DeleteAccountRequest, UpdateProfileRequest, ChangePasswordRequest, CreateChannelRequest, UpdateChannelRequest, CreateDMRequest, SendMessageRequest, SendFriendRequestBody, ChannelMemberActionBody, SetRoleBody, SetMutedBody, SetBannedBody, ClientEvent, ServerEvent, CallKind, CallTrackKind, Call, WS_AUTH_TIMEOUT_MS, AI_USER_ID, MESSAGE_RECALL_WINDOW_MS, GrantAdminRoleRequest, UpdateAdminRoleRequest, BanUserRequest, UpdateSystemSettingsRequest, AdminUserListQuery, AuditLogQuery, AdminDashboardStats, Notification, NotificationWithRead, CreateNotificationRequest, UpdateNotificationRequest

**接口**: User, AdminUser, AuditLog, SystemSettings, ConversationMember, Conversation, PollOption, PollData, PollVote, PollResult, Attachment, Reaction, Message, ForwardedMessageItem, ForwardedMessage, Friendship, FriendRequest, BootstrapData, LoginRequest, RegisterRequest, AuthResponse, DeleteAccountRequest, UpdateProfileRequest, ChangePasswordRequest, CreateChannelRequest, UpdateChannelRequest, CreateDMRequest, SendMessageRequest, SendFriendRequestBody, ChannelMemberActionBody, SetRoleBody, SetMutedBody, SetBannedBody, Call, GrantAdminRoleRequest, UpdateAdminRoleRequest, BanUserRequest, UpdateSystemSettingsRequest, AdminUserListQuery, AuditLogQuery, AdminDashboardStats, Notification, NotificationWithRead, CreateNotificationRequest, UpdateNotificationRequest

**类型**: ID, ISODate, PresenceStatus, Gender, PublicUser, ConversationKind, ChannelRole, SystemRole, AdminPermission, MessageKind, FriendStatus, ClientEvent, ServerEvent, CallKind, CallTrackKind

### admin-routes.ts

**导出**: setupAdminRoutes

**函数**: setupAdminRoutes

**接口**: AuthedRequest

### admin.ts

**导出**: requireAdmin, requirePermission, getAdminRole, grantAdminRole, removeAdminRole, logAuditAction, getSystemSettings, updateSystemSettings, banUser, unbanUser, isUserBanned, getDashboardStats, getAllUsers, getAllChannels, getAuditLogs, deleteUser, deleteChannel, deleteMessage, createNotification, updateNotification, deleteNotification, getNotification, getAllNotifications, getNotificationsForUser, markNotificationRead, getUnreadNotificationCount

**函数**: parseAuth, requireAdmin, requirePermission, getAdminRole, grantAdminRole, removeAdminRole, logAuditAction, getSystemSettings, updateSystemSettings, banUser, unbanUser, isUserBanned, getDashboardStats, getAllUsers, getAllChannels, getAuditLogs, deleteUser, deleteChannel, deleteMessage, hydrateNotification, createNotification, updateNotification, deleteNotification, getNotification, getAllNotifications, getNotificationsForUser, markNotificationRead, getUnreadNotificationCount

**接口**: AuthedRequest

### ai.ts

**导出**: isAiConfigured, generateAiReply

**函数**: toImageUrl, buildContent, isAiConfigured, generateAiReply

**接口**: ChatTextPart, ChatImagePart, ChatMessage

**类型**: ChatContent

### audit.ts

**导出**: auditLog

**函数**: auditLog

### auth.ts

**导出**: issueToken, verifyToken, verifyPassword, hashPassword

**函数**: issueToken, verifyToken, verifyPassword, hashPassword

**接口**: TokenPayload

### config.ts

**导出**: ROOT, REDIS_PREFIX, config

### db-worker.js

**函数**: processQuery, waitAndProcess

### db.ts

**导出**: pool, query, queryOne, execute

**函数**: query, queryOne, execute, columnExists, addColumnIfMissing, initSchema, seed, initAdminAccount

### email.ts

**导出**: reloadTransporter, sendEmail, generateCode, isEmailWhitelisted

**函数**: getSmtpSettings, getTransporter, reloadTransporter, renderTemplate, sendEmail, generateCode, isEmailWhitelisted

### http.ts

**导出**: createHttpApp

**函数**: getClientIp, validateCaptcha, requireAuth, ffmpegExtractPoster, createHttpApp, respond

**接口**: AuthedRequest

### index.ts

**函数**: shutdown

### redis.ts

**导出**: redis, pub, sub, KEYS, setPresence, clearPresence, BusMessage, publishBus, subscribeBus, shutdownRedis

**函数**: setPresence, clearPresence, publishBus, subscribeBus, shutdownRedis

**接口**: BusMessage

### sfu.ts

**导出**: RoomJoinRequest, RoomJoinResult, RoomDownstreamAnswer, RoomIce, ParticipantState, SFU, sfuEvents, getOrCreateRoom, getRoom, closeRoom

**函数**: logInfo, logWarn, logError, logDebug, resolveConstructor, isPrivateIp, isMdnsAddress, sanitizeCandidate, getOrCreateRoom, getRoom, closeRoom

**类**: UpstreamPeer, DownstreamPeer, SFU

**接口**: PublisherTrack, RoomJoinRequest, RoomJoinResult, RoomDownstreamAnswer, RoomIce, ParticipantState

### store.ts

**导出**: ActionResult, ChannelActionResult, store

**函数**: hydrateUser, hydrateConversation, hydrateAttachment, reactionsToList, orderPair, hydrateFriendship

**接口**: UserRow, ConversationRow, MemberRow, MessageRow, AttachmentRow, ReactionRow, FriendshipRow, FriendRequestRow, ActionResult, ChannelActionResult

### webrtc.d.ts

**接口**: RTCConfiguration, RTCIceServer, RTCPeerConnection, RTCSessionDescription, RTCSessionDescriptionInit, RTCIceCandidate, RTCIceCandidateInit, MediaStreamTrack, MediaStream, RTCRtpSender, RTCRtpSendParameters, RTCRtpEncodingParameters, RTCRtpTransceiver, RTCTrackEvent, RTCPeerConnectionIceEvent, EventTarget, Event

**类型**: RTCPeerConnectionState, RTCSdpType, EventListenerOrEventListenerObject, EventListener

### wrtc.d.ts

**导出**: RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, MediaStream, RTCRtpTransceiver

### verification.ts

**导出**: VerificationPurpose, createVerificationCode, verifyCode

**函数**: createVerificationCode, verifyCode

**类型**: VerificationPurpose

### ws.ts

**导出**: Hub, attachWebSocket, getHub

**函数**: formatDuration, attachWebSocket, getHub

**类**: Hub

**接口**: LocalClient

### App.tsx

**导出**: App

**函数**: App, catchUpMissedMessages, SyncOverlay, BootScreen, NavoMark

### AdminPanel.tsx

**导出**: AdminPanel

**函数**: toast, NavItem, SC, InfoRow, Sec, Field, StatusBadge, AdminPanel, openConfirm, DashboardTab, UsersTab, UserDetailModal, ChannelsTab, ChannelDetailModal, SettingsTab, AuditTab, AuditDetailModal, NotificationsTab, startCreate, startEdit, handleSave, handlePublish, handleDelete

**接口**: AdminPanelProps, ToastItem

**类型**: AdminTab

### AppShell.tsx

**导出**: AppShell

**函数**: AppShell, RailDivider, RailButton, CommandPalette, NavoMark

### Avatar.tsx

**导出**: Avatar, PresenceDot

**函数**: Avatar, AISpark, PresenceDot

### CallView.tsx

**导出**: CallView

**函数**: MediaTile, CallView

### ChannelManage.tsx

**导出**: ChannelManage

**函数**: ChannelManage, apply, TabButton, ChannelAvatar, InfoTab, uploadAvatar, save, leave, disband, MembersTab, MemberRow, RoleBadge, AddTab, BannedTab, Field, IconAction, Toggle

**接口**: ChannelManageProps

### ChatView.tsx

**导出**: ChatView

**函数**: ChatView, HistoryTopIndicator, DayedMessageList, DayDivider, groupByDay, SkeletonStream, ConversationSelectorModal, getConvLabel

**接口**: ChatViewProps

### Composer.tsx

**导出**: Composer

**函数**: emojiTokenAt, Composer, click, insertMention, insertEmoji, uploadFiles, uploadAndSendImmediate, handlePaste, onDocPaste, openLocation, send, sendScheduled, sendMarkdown, createPoll, handleSendLongPressStart, handleSendLongPressEnd, sendCard, onKeyDown, AttachmentTray, EmojiPicker, onDown, InlineTextPreview

**接口**: ComposerProps

**类型**: CardMode

### ConfirmModal.tsx

**导出**: ConfirmModal

**函数**: ConfirmModal

**接口**: ConfirmModalProps

### CreateChannelModal.tsx

**导出**: CreateChannelModal

**函数**: CreateChannelModal, toggle, submit

### EmojiText.tsx

**导出**: EmojiText

**函数**: EmojiText

### ErrorBoundary.tsx

**导出**: ErrorBoundary

**类**: ErrorBoundary

**接口**: Props, State

### FriendsView.tsx

**导出**: FriendsView

**函数**: FriendsView, TabButton, FriendsList, openDM, removeFriend, block, unblock, clearHistory, RequestsInbox, accept, decline, AddFriend, getStatus, openModal, closeModal, submitRequest, Section, IconAction, EmptyState

**接口**: FriendsViewProps

**类型**: Tab

### ImageViewer.tsx

**导出**: ImageViewer

**函数**: ImageViewer, onKey

### LocationPicker.tsx

**导出**: LocationPickerBody

**函数**: searchPlaces, reverseGeocode, makeStaticMap, LocationPickerBody, requestLocate, pickPoi, confirm

**接口**: PoiItem, LocationPickerBodyProps

### LocationPickerHost.tsx

**导出**: LocationPickerHost

**函数**: LocationPickerHost

### LocationViewer.tsx

**导出**: LocationViewer

**函数**: LocationViewer, onKey

### Login.tsx

**导出**: Login

**函数**: getPasswordStrength, Login, resetForm, submit, resetCaptcha, Requirement, Stat, NavoMark

**接口**: LoginProps

### Markdown.tsx

**导出**: Markdown, RichInline

**函数**: parseBlocks, emojiMatchAt, nextEmojiIndex, EmojiImg, inlineTokens, MentionChip, Markdown, RichInline, inlineMentionsOnly

**接口**: MarkdownProps

### MediaBrowser.tsx

**导出**: MediaBrowser

**函数**: MediaBrowser, MediaItem, MediaPreview

**接口**: MediaBrowserProps, FilterOption

### MemberPanel.tsx

**导出**: MemberPanel

**函数**: MemberPanel, addMember, ChannelHeader, DMHeader

### MessageBubble.tsx

**导出**: jumpToMessage, MessageBubble

**函数**: jumpToMessage, MessageBubble, startEdit, cancelEdit, saveEdit, keyDownEdit, handleContextMenu, handleTouchStart, handleTouchEnd, recall, copyText, PollBlock, handleVote, PollDetailPopup, ReadUserListPopup, MessageStatus, BubbleBody, ReplyRef, FriendCardBlock, openDM, ChannelCardBlock, handleOpen, ForwardedCardBlock, ForwardedItem, renderContent, parseLocationPayload, LocationBlock, Attachments

**接口**: MessageBubbleProps, LocationPayload

### MessageSearch.tsx

**导出**: MessageSearch

**函数**: MessageSearch, MessagePreview

**接口**: MessageSearchProps, FilterOption

### MobileShell.tsx

**导出**: MobileShell

**函数**: MobileShell, MobilePage, MobileList, startDM, MobileConvItem, onTouchStart, clearLongPress, handleClick, onContextMenu, MobileChat, MobileUserDetail, NavoMark

**类型**: MobileView

### NotificationBell.tsx

**导出**: NotificationBell

**函数**: NotificationBell, NotificationModal, NotificationCard

### NumberPadInput.tsx

**接口**: NumberPadInputProps

### PatternLockInput.tsx

**函数**: getPointFromPosition

**接口**: PatternLockInputProps, Point

### ProfileSettings.tsx

**导出**: ProfileSettings

**函数**: ProfileSettings, toggleSound, handleStatusChange, pickAvatar, save, changePassword, deleteAccount

### Sidebar.tsx

**导出**: Sidebar

**函数**: Sidebar, startDM, SectionHeader, EmptyHint, PinDivider, splitPinned, ConversationItem, openMenuAt, closeMenu, onContextMenu, onTouchStart, clearLongPress, handleClickCapture, handleKeyDown, ConvMenu

**接口**: SidebarProps

### StatusPicker.tsx

**导出**: StatusPicker

**函数**: StatusPicker

**接口**: StatusPickerProps

### Toast.tsx

**导出**: Toast

**函数**: Toast

### TypingIndicator.tsx

**导出**: TypingIndicator

**函数**: TypingIndicator

**接口**: TypingIndicatorProps

### UserCard.tsx

**导出**: UserCard

**函数**: UserCard, run, openDM, Tag

**接口**: UserCardProps

### UserCardPopover.tsx

**导出**: UserCardPopover

**函数**: UserCardPopover

**接口**: UserCardPopoverProps

### VideoViewer.tsx

**导出**: VideoViewer

**函数**: VideoViewer, onKey

### global.d.ts

**接口**: IntrinsicElements

### api.ts

**导出**: getToken, setToken, api

**函数**: getToken, setToken, request

### call.ts

**导出**: useCallStore, getWebRTCDiagnostics, callController

**函数**: logSignal, logIce, id, dumpCallState, pollStats, startStatsPolling, stopStatsPolling, logCompat, getWebRTCDiagnostics, detectPeerConnectionCtor, testPeerConnectionCtor, getPeerConnectionCtor, resetPeerConnectionCtor, iceServers, createPeerConnection, runRenegotiationStep, webRTCSupported, addLocalTracks, getLocalMedia, publishUpstream, emptyCall, enterCall

**接口**: CallParticipant, RemoteMedia, CurrentCall, CallState

**类型**: CallPhase, PeerConnectionConstructor

### captcha-config.ts

**导出**: loadCaptchaConfig, getCaptchaConfig

**函数**: loadCaptchaConfig, getCaptchaConfig

**接口**: CaptchaConfig

### location-picker.ts

**导出**: LocationPayload, useLocationPicker

**接口**: LocationPayload, LocationPickerState

### sound.ts

**导出**: notificationSound

**类**: NotificationSound

### store.ts

**导出**: useChatStore, selectHasUnseenFriendRequests, selectPendingRequesters, selectConvHasFriendRequest

**函数**: loadCollapsed, loadPinned, loadHiddenConvs, loadDrafts, loadScheduledSends, loadPollDrafts, loadPollResults, savePollResults, loadConvCache, saveConvCache, loadMsgCache, saveMsgCache, selectHasUnseenFriendRequests, selectPendingRequesters, selectConvHasFriendRequest

**接口**: TypingState, ScheduledSend, PollDraft, ChatState, CacheEntry

**类型**: Theme

### ui.ts

**导出**: Overlay, useUI

**接口**: UIState

**类型**: Overlay

### useIsMobile.ts

**导出**: useIsMobile

**函数**: useIsMobile

### utils.ts

**导出**: cn, initials, formatTime, formatRelative, dayLabel, formatBytes, isImage, isVideo, messageMentionsUser, extractVideoPoster, downloadAttachment, safeDateMs, EMOJI_TOKEN_RE, normalizeEmojiTokens, emojiPreviewText, messagePreview

**函数**: cn, initials, formatTime, formatRelative, dayLabel, formatBytes, isImage, isVideo, messageMentionsUser, extractVideoPoster, downloadAttachment, safeDateMs, normalizeEmojiTokens, emojiPreviewText, messagePreview

### viewer.ts

**导出**: ViewerImage, ViewerVideo, ViewerLocation, useViewer

**接口**: ViewerImage, ViewerVideo, ViewerLocation, ViewerState

### ws-client.ts

**导出**: WSStatus, WSClient, wsClient

**类**: WSClient

**类型**: Listener, WSStatus, StatusListener

## 配置文件

| 文件 | 用途 |
|------|------|
| package.json | 根 package.json (monorepo) |
| server/package.json | 服务端依赖 |
| web/package.json | 前端依赖 |
| shared/package.json | 共享模块依赖 |
| server/tsconfig.json | 服务端 TS 配置 |
| web/tsconfig.json | 前端 TS 配置 |
| shared/tsconfig.json | 共享模块 TS 配置 |
| web/vite.config.ts | Vite 构建配置 |
| web/tailwind.config.js | TailwindCSS 配置 |
| .env.example | 环境变量模板 |

## 更新日志

**最后更新**: 2026/6/27
**索引版本**: 1.0.0
**文件数量**: 85 个核心源码文件
