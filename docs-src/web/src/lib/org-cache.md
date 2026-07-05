# org-cache.ts — Organization Cache

## Purpose

Provides a memory-cached lookup for organization display paths (e.g., "Company > Department > Team"). Avoids redundant API calls when the same org ID is displayed in multiple places.

## Exports

| Export | Kind | Description |
|--------|------|-------------|
| `getOrgDisplayPath(orgId)` | Function | Returns `"Org1 > Org2 > Org3"` string or `null` |
| `invalidateOrgCache(orgId?)` | Function | Clears cache for a specific org or all orgs |

## Key Logic

**In-memory cache.** A `Map<string, Promise<string | null>>` stores the promise for each org ID. The same org ID returns the same promise on subsequent calls.

**API call.** Fetches `/api/orgs/{orgId}` with auth header. Extracts `path` array and joins names with ` > `.

**`invalidateOrgCache`** is used after admin org mutations (create/delete) to ensure fresh data.

## Dependencies

| Import | Purpose |
|--------|---------|
| `./api` | `getToken` for auth header |
| `./utils` | `apiFetch` for HTTP request |

## Constraints and Gotchas

- The cache stores promises, not resolved values. If the API call fails, the promise resolves to `null` and is cached — subsequent calls for the same org return `null` without retrying. Call `invalidateOrgCache` to retry.
- No TTL; entries persist for the session lifetime.
- The cache is module-level; shared across all components.

## Interactions

- **Components:** User card popovers and member lists call `getOrgDisplayPath` to show organizational hierarchy.
- **Admin:** `invalidateOrgCache()` is called after org create/delete operations.
