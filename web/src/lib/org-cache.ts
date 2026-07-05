import { getToken } from "./api";
import { apiFetch } from "./utils";

const cache = new Map<string, Promise<string | null>>();

/** 获取组织完整路径（带内存缓存，同一 orgId 只请求一次） */
export function getOrgDisplayPath(orgId: string): Promise<string | null> {
  if (!orgId) return Promise.resolve(null);

  const cached = cache.get(orgId);
  if (cached) return cached;

  const token = getToken();
  const promise = apiFetch(`/api/orgs/${orgId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) =>
      data?.path ? (data.path as { name: string }[]).map((o) => o.name).join(" > ") : null,
    )
    .catch(() => null);

  cache.set(orgId, promise);
  return promise;
}

export function invalidateOrgCache(orgId?: string) {
  if (orgId) cache.delete(orgId);
  else cache.clear();
}
