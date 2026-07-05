import { Plus, Trash2 } from "lucide-react";
import { Sec, Field } from "../shared";
import { useT } from "../../../lib/i18n";

export interface IceServer {
  url: string;
  username?: string;
  credential?: string;
}

export interface IceConfig {
  stunServers: IceServer[];
  turnServers: IceServer[];
}

function ServerRow({
  server,
  onChange,
  onRemove,
  showAuth,
  placeholder,
}: {
  server: IceServer;
  onChange: (s: IceServer) => void;
  onRemove: () => void;
  showAuth: boolean;
  placeholder: string;
}) {
  const t = useT();
  const isValid = server.url.trim().length > 0
    && (!showAuth || (server.username || "").trim().length > 0);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line-light/70 bg-surface-soft p-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={server.url}
          onChange={(e) => onChange({ ...server, url: e.target.value })}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-line-light/70 bg-surface px-3 py-1.5 text-sm outline-none focus:border-aqua"
        />
        <button
          onClick={onRemove}
          className="rounded-lg p-1.5 text-ink-muted hover:bg-red-50 hover:text-red-500"
          title={t("common.delete")}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {showAuth && (
        <div className="flex gap-2">
          <input
            type="text"
            value={server.username || ""}
            onChange={(e) => onChange({ ...server, username: e.target.value })}
            placeholder={t("adminSettings.usernameRequired")}
            className={`flex-1 rounded-lg border bg-surface px-3 py-1.5 text-sm outline-none ${
              server.username?.trim() ? "border-line-light/70 focus:border-aqua" : "border-red-300 focus:border-red-400"
            }`}
          />
          <input
            type="password"
            value={server.credential || ""}
            onChange={(e) => onChange({ ...server, credential: e.target.value })}
            placeholder={t("adminSettings.passwordOptional")}
            className="flex-1 rounded-lg border border-line-light/70 bg-surface px-3 py-1.5 text-sm outline-none focus:border-aqua"
          />
        </div>
      )}
      {!isValid && (
        <div className="text-xs text-red-500">
          {showAuth ? t("adminSettings.serverRequired") : t("adminSettings.serverRequired")}
        </div>
      )}
    </div>
  );
}

export function IceSettings({
  iceConfig,
  setIceConfig,
}: {
  iceConfig: IceConfig;
  setIceConfig: (c: IceConfig) => void;
}) {
  const t = useT();
  const addStun = () => {
    setIceConfig({
      ...iceConfig,
      stunServers: [...iceConfig.stunServers, { url: "" }],
    });
  };
  const addTurn = () => {
    setIceConfig({
      ...iceConfig,
      turnServers: [...iceConfig.turnServers, { url: "", username: "", credential: "" }],
    });
  };
  const updateStun = (i: number, s: IceServer) => {
    const list = [...iceConfig.stunServers];
    list[i] = s;
    setIceConfig({ ...iceConfig, stunServers: list });
  };
  const updateTurn = (i: number, s: IceServer) => {
    const list = [...iceConfig.turnServers];
    list[i] = s;
    setIceConfig({ ...iceConfig, turnServers: list });
  };
  const removeStun = (i: number) => {
    setIceConfig({
      ...iceConfig,
      stunServers: iceConfig.stunServers.filter((_, idx) => idx !== i),
    });
  };
  const removeTurn = (i: number) => {
    setIceConfig({
      ...iceConfig,
      turnServers: iceConfig.turnServers.filter((_, idx) => idx !== i),
    });
  };

  return (
    <Sec title={t("adminSettings.stunTurn")}>
      <Field label={t("adminSettings.stun")}>
        <div className="space-y-2">
          {iceConfig.stunServers.map((s, i) => (
            <ServerRow
              key={i}
              server={s}
              onChange={(s) => updateStun(i, s)}
              onRemove={() => removeStun(i)}
              showAuth={false}
              placeholder="stun:stun.l.google.com:19302"
            />
          ))}
          <button
            onClick={addStun}
            className="flex items-center gap-1 rounded-lg border border-dashed border-line-light/70 px-3 py-1.5 text-xs text-ink-muted hover:border-ocean hover:text-ocean"
          >
            <Plus className="h-3.5 w-3.5" /> {t("adminSettings.addStun")}
          </button>
        </div>
      </Field>

      <Field label={t("adminSettings.turn")}>
        <div className="space-y-2">
          {iceConfig.turnServers.map((s, i) => (
            <ServerRow
              key={i}
              server={s}
              onChange={(s) => updateTurn(i, s)}
              onRemove={() => removeTurn(i)}
              showAuth={true}
              placeholder="turn:turn.example.com:3478"
            />
          ))}
          <button
            onClick={addTurn}
            className="flex items-center gap-1 rounded-lg border border-dashed border-line-light/70 px-3 py-1.5 text-xs text-ink-muted hover:border-ocean hover:text-ocean"
          >
            <Plus className="h-3.5 w-3.5" /> {t("adminSettings.addTurn")}
          </button>
        </div>
      </Field>

      <div className="text-xs text-ink-muted">
        <p>{t("adminSettings.stunDesc")}</p>
        <p>{t("adminSettings.turnDesc")}</p>
      </div>
    </Sec>
  );
}
