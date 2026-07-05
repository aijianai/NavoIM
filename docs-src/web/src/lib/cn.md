# cn.ts -- ClassName Utility Re-export

## Purpose

Re-exports the `cn` class name combiner function from `./utils` for convenient importing. This is a barrel-style re-export file.

## Exports

| Export | Kind | Description |
|--------|------|-------------|
| `cn` | Function | Re-exported from `./utils` |

## Key Logic

`cn(...inputs: ClassValue[])` is a simple wrapper around `clsx` that merges class name strings, objects, and arrays into a single string. It does **not** use `tailwind-merge` -- the codebase relies on plain `clsx` for conditional class composition.

```ts
// From utils.ts
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
```

## Dependencies

| Import | Purpose |
|--------|---------|
| `./utils` | Source of the `cn` function |
| `clsx` | Lightweight className joining library (used by `utils.ts`) |

## Constraints and Gotchas

- This file exists purely as a short import path (`import { cn } from "@/lib/cn"`) instead of the longer `import { cn } from "@/lib/utils"`.
- If `tailwind-merge` is ever added, the change only needs to happen in `utils.ts`; this re-export stays the same.
- The `clsx` library handles falsy values, nested arrays, and object syntax automatically.

## Interactions

- Used by components that need conditional Tailwind CSS class composition (e.g., dialog backdrops, button states, responsive layouts).
