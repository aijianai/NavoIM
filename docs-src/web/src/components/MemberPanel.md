# MemberPanel.tsx

## Purpose

Right-side panel showing conversation members. Displays member list with presence, allows adding friends to channels.

## Exports

- `MemberPanel()` — Member panel component (hidden on screens < xl breakpoint).

## Key Logic

- **Member list**: Maps `conv.memberIds` to `users` store, shows avatar, name, presence dot, last seen.
- **Add member**: Channel-only feature. Shows friends not in conversation. Calls `api.addMember()`.
- **Channel header**: Shows channel icon, name, topic, member count.
- **DM header**: Shows other user's avatar and info.
- **Self indicator**: "You" badge on current user.

## Dependencies

- `useChatStore` — selectedId, conversationsById, users, me, friends, toggleMemberPanel, upsertConversation
- `api.addMember`
- `Avatar`, `PresenceDot`
- `cn`, `formatRelative`

## Constraints and Gotchas

- Only visible on xl+ screens (`hidden xl:flex`).
- `candidates` excludes current members, AI user, and non-friends.
- Panel toggled via `memberPanelOpen` in store.

## Interactions

- `toggleMemberPanel` from store closes the panel.
- Adding a member updates conversation via `upsertConversation()`.
