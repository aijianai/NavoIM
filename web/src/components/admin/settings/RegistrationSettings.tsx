import type { SystemSettings } from "@navo/shared";
import { Sec, Field, Switch } from "../shared";
import { useT } from "../../../lib/i18n";
import { useState, useEffect } from "react";
import { api } from "../../../lib/api";
import { X, Plus, Trash2 } from "lucide-react";

export function RegistrationSettings({
  settings,
  setSettings,
}: {
  settings: SystemSettings;
  setSettings: (s: SystemSettings) => void;
}) {
  const t = useT();
  const [activeList, setActiveList] = useState<null | "email" | "phone">(null);
  return (
    <Sec title={t("adminSettings.registration")}>
      <Field label={t("adminSettings.allowRegister")}>
        <Switch
          checked={settings.allowRegistration}
          onChange={(v) => setSettings({ ...settings, allowRegistration: v })}
          label={t("adminSettings.allowRegisterDesc")}
        />
      </Field>

      <Field label={t("login.methodUsername")}>
        <Switch
          checked={settings.usernameRegistrationEnabled}
          onChange={(v) => setSettings({ ...settings, usernameRegistrationEnabled: v })}
          label={t("adminSettings.usernameRegistration")}
        />
      </Field>

      <Field label={t("login.methodEmail")}>
        <Switch
          checked={settings.emailRegistrationEnabled}
          onChange={(v) => setSettings({ ...settings, emailRegistrationEnabled: v })}
          label={t("adminSettings.emailRegistration")}
        />
        {settings.emailRegistrationEnabled && (
          <button
            type="button"
            onClick={() => setActiveList("email")}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-line-light/70 bg-surface-soft px-3 py-1.5 text-xs text-ocean hover:bg-ocean/10"
          >
            {t("adminSettings.manageWhitelist")}
          </button>
        )}
      </Field>

      <Field label={t("login.methodPhone")}>
        <Switch
          checked={settings.phoneRegistrationEnabled}
          onChange={(v) => setSettings({ ...settings, phoneRegistrationEnabled: v })}
          label={t("adminSettings.phoneRegistration")}
        />
        {settings.phoneRegistrationEnabled && (
          <button
            type="button"
            onClick={() => setActiveList("phone")}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-line-light/70 bg-surface-soft px-3 py-1.5 text-xs text-ocean hover:bg-ocean/10"
          >
            {t("adminSettings.manageWhitelist")}
          </button>
        )}
      </Field>

      <Field label={t("adminSettings.inviteCode")}>
        <Switch
          checked={settings.requireInviteCode}
          onChange={(v) => setSettings({ ...settings, requireInviteCode: v })}
          label={t("adminSettings.requireInviteCode")}
        />
        {settings.requireInviteCode && (
          <input
            value={settings.inviteCode || ""}
            onChange={(e) => setSettings({ ...settings, inviteCode: e.target.value })}
            placeholder={t("adminSettings.inviteCodePlaceholder")}
            className="mt-2 w-full rounded-xl border border-line-light/70 bg-surface px-3 py-2 text-sm outline-none focus:border-aqua"
          />
        )}
      </Field>

      {activeList === "email" && <WhitelistModal type="email" onClose={() => setActiveList(null)} />}
      {activeList === "phone" && <WhitelistModal type="phone" onClose={() => setActiveList(null)} />}
    </Sec>
  );
}

function WhitelistModal({ type, onClose }: { type: "email" | "phone"; onClose: () => void }) {
  const t = useT();
  const [entries, setEntries] = useState<Array<{ id: string; pattern: string; note: string | null; created_at: string }>>([]);
  const [pattern, setPattern] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const loadEntries = () => {
    const promise = type === "email" ? api.admin.getEmailWhitelist() : api.admin.getPhoneWhitelist();
    promise.then((d) => setEntries(d.entries)).catch(() => setEntries([]));
  };
  useEffect(() => { loadEntries(); }, []);

  async function handleAdd() {
    if (!pattern.trim()) return;
    setLoading(true);
    try {
      const promise = type === "email" ? api.admin.addEmailWhitelist({ pattern: pattern.trim(), note: note.trim() || undefined }) : api.admin.addPhoneWhitelist({ pattern: pattern.trim(), note: note.trim() || undefined });
      await promise;
      setPattern("");
      setNote("");
      loadEntries();
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(id: string) {
    const promise = type === "email" ? api.admin.removeEmailWhitelist(id) : api.admin.removePhoneWhitelist(id);
    await promise;
    loadEntries();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-line-light/70 bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold">{type === "email" ? t("adminSettings.emailWhitelist") : t("adminSettings.phoneWhitelist")}</h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-line-light/50">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-3 text-xs text-ink-muted">{t("adminSettings.whitelistHint")}</p>
        <div className="mb-3 space-y-2">
          <input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder={type === "email" ? "user@example.com 或 *@example.com" : "+8613*"}
            className="w-full rounded-xl border border-line-light/70 bg-surface-soft px-3 py-2 text-sm outline-none focus:border-aqua"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("adminSettings.whitelistNotePlaceholder")}
            className="w-full rounded-xl border border-line-light/70 bg-surface-soft px-3 py-2 text-sm outline-none focus:border-aqua"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={loading || !pattern.trim()}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-ocean px-3 py-2 text-sm font-medium text-white hover:bg-ocean/90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> {t("adminSettings.whitelistAdd")}
          </button>
        </div>
        <div className="max-h-64 space-y-1.5 overflow-y-auto">
          {entries.length === 0 ? (
            <div className="py-6 text-center text-xs text-ink-muted">{t("adminSettings.whitelistEmpty")}</div>
          ) : entries.map((e) => (
            <div key={e.id} className="flex items-center justify-between rounded-lg border border-line-light/70 bg-surface-soft px-3 py-2 text-sm">
              <div>
                <div className="font-mono text-xs">{e.pattern}</div>
                {e.note && <div className="text-[11px] text-ink-muted">{e.note}</div>}
              </div>
              <button
                type="button"
                onClick={() => handleRemove(e.id)}
                className="ml-2 rounded p-1 text-danger hover:bg-danger/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
