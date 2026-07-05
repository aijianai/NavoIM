import { useState, useEffect } from "react";
import { Plus, Trash2, ChevronRight, ChevronDown, Loader2, Users, Building2 } from "lucide-react";
import { api } from "../../lib/api";
import { useT } from "../../lib/i18n";
import { toast } from "./shared";
import type { Organization } from "@navo/shared";

export function OrgsTab() {
  const t = useT();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newParentId, setNewParentId] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [members, setMembers] = useState<Record<string, any[]>>({});
  const [loadingMembers, setLoadingMembers] = useState<Set<string>>(new Set());

  const fetch = async () => {
    setLoading(true);
    try {
      const list = await api.admin.getOrganizations();
      setOrgs(list);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) { toast(t("server.orgNameRequired")); return; }
    setCreating(true);
    try {
      await api.admin.createOrganization(newName.trim(), newParentId || undefined, newDesc.trim() || undefined);
      toast(t("admin.orgCreated"));
      setNewName(""); setNewParentId(""); setNewDesc("");
      fetch();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("admin.confirmDeleteOrg"))) return;
    try {
      await api.admin.deleteOrganization(id);
      toast(t("admin.orgDeleted"));
      fetch();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const toggleExpand = async (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      if (!members[id]) {
        setLoadingMembers((prev) => new Set(prev).add(id));
        try {
          const m = await api.admin.getOrgMembers(id);
          setMembers((prev) => ({ ...prev, [id]: m }));
        } catch (e) {
          toast((e as Error).message, "error");
        } finally {
          setLoadingMembers((prev) => { const n = new Set(prev); n.delete(id); return n; });
        }
      }
    }
    setExpanded(next);
  };

  const rootOrgs = orgs.filter((o) => !o.parentId);
  const childrenOf = (parentId: string) => orgs.filter((o) => o.parentId === parentId);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">{t("admin.orgManagement")}</h2>

      {/* Create */}
      <div className="rounded-2xl border border-line-light/70 bg-surface p-4 space-y-3">
        <h3 className="text-sm font-medium text-ink-primary">{t("admin.createOrg")}</h3>
        <div className="flex flex-wrap gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder={t("server.orgNameRequired")}
            className="flex-1 min-w-[160px] rounded-xl border border-line-light/70 bg-surface-soft px-3 py-2 text-sm outline-none focus:border-aqua"
          />
          <select value={newParentId} onChange={(e) => setNewParentId(e.target.value)}
            className="rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua">
            <option value="">{t("admin.topLevelOrg")}</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
            placeholder={t("admin.orgDescOptional")}
            className="w-48 rounded-xl border border-line-light/70 bg-surface-soft px-3 py-2 text-sm outline-none focus:border-aqua"
          />
          <button onClick={handleCreate} disabled={creating || !newName.trim()}
            className="btn-primary px-4 py-2 text-sm">
            {creating ? <Loader2 className="inline h-4 w-4 animate-spin" /> : <Plus className="inline h-4 w-4" />} {t("common.submit")}
          </button>
        </div>
      </div>

      {/* Org tree */}
      <div className="rounded-2xl border border-line-light/70 bg-surface overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-ink-muted" /></div>
        ) : orgs.length === 0 ? (
          <div className="py-12 text-center text-sm text-ink-muted">{t("admin.noOrgs")}</div>
        ) : (
          <div className="p-2 space-y-1">
            {rootOrgs.map((org) => (
              <OrgNode key={org.id} org={org} childrenOf={childrenOf} depth={0}
                expanded={expanded} onToggle={toggleExpand}
                members={members} loadingMembers={loadingMembers}
                onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OrgNode({ org, childrenOf, depth, expanded, onToggle, members, loadingMembers, onDelete }: {
  org: Organization;
  childrenOf: (parentId: string) => Organization[];
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  members: Record<string, any[]>;
  loadingMembers: Set<string>;
  onDelete: (id: string) => void;
}) {
  const children = childrenOf(org.id);
  const isExpanded = expanded.has(org.id);
  const orgMembers = members[org.id];
  const isLoadingMembers = loadingMembers.has(org.id);
  const t = useT();

  return (
    <div>
      <div className="flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-surface-soft group"
        style={{ paddingLeft: `${12 + depth * 20}px` }}>
        {children.length > 0 ? (
          <button onClick={() => onToggle(org.id)} className="text-ink-muted hover:text-ink-primary">
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : <div className="w-4" />}
        <Building2 className="h-4 w-4 text-ink-muted shrink-0" />
        <span className="text-sm font-medium text-ink-primary">{org.name}</span>
        {org.description && <span className="text-xs text-ink-muted truncate max-w-[200px]">{org.description}</span>}
        <button onClick={() => onToggle(org.id)} className="ml-auto text-ink-muted hover:text-ink-primary">
          <Users className="h-4 w-4" />
        </button>
        <button onClick={() => onDelete(org.id)} className="text-ink-muted opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {isExpanded && (
        <div className="pb-1">
          {/* Members */}
          {isLoadingMembers ? (
            <div className="flex items-center gap-2 px-6 py-1 text-xs text-ink-muted" style={{ paddingLeft: `${28 + depth * 20}px` }}>
              <Loader2 className="h-3 w-3 animate-spin" /> {t("common.loading")}...
            </div>
          ) : orgMembers && orgMembers.length > 0 ? (
            <div className="space-y-0.5">
              {orgMembers.map((m: any) => (
                <div key={m.id} className="flex items-center gap-2 px-6 py-1 text-xs text-ink-muted hover:bg-surface-soft rounded-lg"
                  style={{ paddingLeft: `${28 + depth * 20}px` }}>
                  <span className="text-ink-primary">{m.display_name}</span>
                  <span>@{m.username}</span>
                  {m.org_title && <span className="rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] text-ocean">{m.org_title}</span>}
                </div>
              ))}
            </div>
          ) : (
            <div className="px-6 py-1 text-xs text-ink-muted" style={{ paddingLeft: `${28 + depth * 20}px` }}>
              {t("member.noMembers")}
            </div>
          )}
          {/* Children */}
          {children.map((child) => (
            <OrgNode key={child.id} org={child} childrenOf={childrenOf} depth={depth + 1}
              expanded={expanded} onToggle={onToggle}
              members={members} loadingMembers={loadingMembers}
              onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
