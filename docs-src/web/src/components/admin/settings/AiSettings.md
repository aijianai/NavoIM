# settings/AiSettings.tsx — AI Assistant Configuration

## Purpose

Form for enabling and configuring the AI assistant integration. Supports OpenAI-compatible API endpoints with a connection test feature. Also allows customizing the AI agent's personality (name, bio, avatar, system prompt).

## Exports

- `AiSettings` — React component with `aiConfig` and `setAiConfig` props.

## Key Logic

- **Enable toggle**: Checkbox bound to `aiConfig.enabled`.
- **API URL**: Text input for base URL (e.g., `https://api.openai.com/v1`).
- **API Key**: Password input.
- **Model**: Text input (e.g., `gpt-3.5-turbo`).
- **AI Name**: Text input for the AI assistant's display name.
- **AI Bio**: Textarea for the AI assistant's introduction/bio.
- **AI Avatar URL**: Text input for the AI assistant's avatar image URL.
- **System Prompt**: Textarea (monospace font) for administrators to define a custom personality/prompt for the AI assistant. This prompt is prepended to the default system prompt.
- **Test connection**: Button calls `api.admin.testAi()` with current config. Displays success/failure with latency in ms.

## Dependencies

- `api` from `../../../lib/api` — `admin.testAi()`.
- `Sec`, `Field` from `../shared`.
- `useT` from `../../../lib/i18n`.

## Constraints and Gotchas

- `AiConfig` interface is defined locally (not from `@navo/shared`).
- Test result is stored in local state and cleared on re-test.
- No validation on URL format or model name.
- Changes to name/bio/avatar are synced to the `u_navo_ai` user record in the database on save.

## Interactions

- Receives config object and setter from `SettingsTab`.
- Test button does not save the config; it only validates connectivity.
- Name, bio, avatar URL are used to update the AI user profile in the `users` table.
