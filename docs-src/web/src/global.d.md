# global.d.ts -- Global JSX Type Declarations

## Purpose

Extends the JSX `IntrinsicElements` interface to support custom HTML elements that are not part of the standard DOM. Currently declares the `<cap-widget>` custom element used for Cloudflare Turnstile captcha integration.

## Exports

None (ambient declaration file).

## Key Logic

Declares the `<cap-widget>` custom element with these optional attributes:

| Attribute | Type | Purpose |
|-----------|------|---------|
| `id` | `string` | Widget identifier |
| `data-cap-api-endpoint` | `string` | Cloudflare Turnstile API endpoint URL |
| `style` | `React.CSSProperties` | Inline styles |
| `className` | `string` | CSS class name |

This prevents TypeScript/JSX from erroring when `<cap-widget>` appears in React components.

## Dependencies

None.

## Constraints and Gotchas

- This is a global ambient declaration; it affects all JSX in the `web` package.
- The `<cap-widget>` element is a web component provided by Cloudflare Turnstile. It must be loaded via a `<script>` tag in `index.html` before the React app mounts.
- If additional custom elements are added later, they should be declared in this file.

## Interactions

- Used by the captcha component (`web/src/lib/captcha-config.ts` or related) which renders `<cap-widget>` for human verification.
