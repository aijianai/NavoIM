# ErrorBoundary.tsx

## Purpose

React error boundary that catches rendering errors and displays a fallback UI with reload option.

## Exports

- `ErrorBoundary({ children, fallback })` — Error boundary component.

## Key Logic

- **Error catching**: `getDerivedStateFromError` sets `hasError` state.
- **Logging**: `componentDidCatch` logs error and component stack to console.
- **Fallback**: Custom fallback via `props.fallback` or default error screen with reload button.
- **Default UI**: Full-screen dark overlay with warning icon, error message, and retry button.

## Dependencies

- `useChatStore` — language (for i18n in fallback)
- `@navo/shared` — t (shared translation)

## Constraints and Gotchas

- Class component (required for error boundaries).
- `getDerivedStateFromError` is static.
- Default fallback uses `window.location.reload()`.

## Interactions

- Wraps the entire app or specific sections to catch rendering errors.
