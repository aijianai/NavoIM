# ChannelManage.tsx

## Purpose

Channel management modal. Allows owners/admins to edit channel info, manage members (add/remove/ban/mute), and view banned users.

## Exports

- `ChannelManage({ conversationId, onClose })` — Channel management modal.

## Key Logic

- **Tabs**: Info, Members, Add Member, Banned.
- **Info tab**: Edit name, topic, icon, privacy. Owner can transfer ownership or delete channel.
- **Members tab**: List members with roles (owner/admin/member). Actions: change role, mute/unmute, kick, ban.
- **Add tab**: Search friends not in channel, add via `api.addMember()`.
- **Banned tab**: List banned members, unban via `api.unbanMember()`.
- **Role hierarchy**: `canManage = owner || admin`. Only owner can transfer ownership or delete.
- **Report**: Each member has a report button opening `ReportModal`.

## Dependencies

- `useChatStore` — conversationsById, users, me, friends, upsertConversation
- `api.getConversation`, `api.updateConversation`, `api.addMember`, `api.removeMember`, `api.banMember`, `api.unbanMember`, `api.setMemberRole`, `api.muteMember`, `api.unmuteMember`, `api.transferOwnership`, `api.deleteConversation`
- `Avatar`, `ReportModal`, `useUI`
- `@navo/shared` — ChannelRole, Conversation, ConversationMember

## Constraints and Gotchas

- Fetches fresh conversation data on mount to ensure latest member list.
- Ban count shown in tab label.
- Owner cannot be kicked or banned.
- Mute duration is 1 hour (hardcoded).

## Interactions

- `onClose` callback closes modal.
- `useUI` overlay system can open this modal externally.
- Member changes propagate via `upsertConversation()`.
