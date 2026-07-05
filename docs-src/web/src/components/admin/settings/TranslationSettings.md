# settings/TranslationSettings.tsx — Translation Configuration

## Purpose

Form for configuring the translation provider and API keys. Supports DeepL, Bing, Google, and Bing Reverse providers.

## Exports

- `TranslationSettings` — React component with `translationConfig` and `setTranslationConfig` props.

## Key Logic

- **Provider selector**: Dropdown with four options: `deepl`, `bing`, `google`, `bingReverse`.
- **API key input**: Dynamically maps to the correct key field (`deeplApiKey`, `googleApiKey`, `bingApiKey`) based on selected provider. Only shown for providers that require an API key.
- **Test button**: Calls `api.translate()` with a hardcoded test string ("Hello, world!" to "zh-CN"). Displays the translated result.

## Dependencies

- `api` from `../../../lib/api` — `translate()`.
- `Sec`, `Field` from `../shared`.
- `useT` from `../../../lib/i18n`.

## Constraints and Gotchas

- `TranslationConfig` interface is defined locally (not from `@navo/shared`).
- `bingReverse` provider does not show an API key input (assumed to be key-free).
- Test uses a hardcoded English-to-Chinese translation; no configurable test parameters.
- API key input is `type="password"` for all providers.

## Interactions

- Receives config object and setter from `SettingsTab`.
- Test button does not save the config; it validates the current key works.
