# translate.ts — Multi-Provider Translation

## Purpose

Translates text to a target language using one of four providers: DeepL, Bing (official), Google, or Bing Reverse (scraped).

## Exports

- `translate(text, targetLang, provider, apiKey)` — main entry; dispatches to the selected provider.
- `TARGET_LANGS` — readonly array of supported target language codes: `zh-CN`, `en`, `ja`, `ko`, `fr`, `de`, `es`.
- `TranslateTargetLang` — type union of `TARGET_LANGS`.
- `TranslationProvider` — type union `"deepl" | "bing" | "google" | "bingReverse"`.

## Key Logic

- **DeepL**: POSTs to `api-free.deepl.com/v2/translate` with form-encoded body. Maps `en` to `EN-US`.
- **Bing**: POSTs to `cognitive.microsofttranslator.com` with empty subscription key. Maps `zh-CN` to `zh-Hans`.
- **Google**: POSTs to `translation.googleapis.com` with API key in query string.
- **Bing Reverse**: Scrapes `cn.bing.com/translator` HTML to extract `IG`, `IID`, and abuse-prevention token/key. Caches these params (expires per server response, max 1 hour). POSTs to `ttranslatev3` endpoint. On 205/400, refreshes params and retries once. Parses both HTML (`data-translation` attribute) and JSON responses. HTML entities are unescaped via `htmlUnescape`.

## Dependencies

- No external packages; uses native `fetch`.

## Constraints and Gotchas

- Bing Reverse is unofficial and fragile; it scrapes the Bing Translator page and relies on regex extraction of page parameters.
- Bing Reverse maintains an in-memory cookie jar and param cache. If Bing changes their page structure, the scraper breaks silently.
- The Bing official provider sends an empty `Ocp-Apim-Subscription-Key`, which may not work without a valid key.
- All providers throw on non-200 responses; callers must catch.
- No retry logic except Bing Reverse's single retry on 205/400.

## Interactions

Called by the message translation endpoint. The caller selects the provider and passes the API key (stored in admin settings). Translated text is returned as a string.
