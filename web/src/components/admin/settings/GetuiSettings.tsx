import { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { Sec, Field } from "../shared";
import { api } from "../../../lib/api";
import { toast } from "../shared";

export interface GetuiConfig {
  appId: string;
  appKey: string;
  appSecret: string;
  masterSecret: string;
}

interface PushToken {
  user_id: string;
  token: string;
  created_at: string;
  username: string;
  display_name: string;
}

export function GetuiSettings({
  getuiConfig,
  setGetuiConfig,
}: {
  getuiConfig: GetuiConfig;
  setGetuiConfig: (c: GetuiConfig) => void;
}) {
  const [testing, setTesting] = useState(false);
  const [tokens, setTokens] = useState<PushToken[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(true);

  const loadTokens = () => {
    setLoadingTokens(true);
    api.admin.getPushTokens().then(setTokens).catch(() => {}).finally(() => setLoadingTokens(false));
  };

  useEffect(() => { loadTokens(); }, []);

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await api.admin.testGetuiPush();
      if (!res.configOk) {
        toast("个推配置不完整，请先保存配置", "error");
      } else if (res.total === 0) {
        toast("未找到已注册的设备，请先在 APK 上登录", "error");
      } else if (res.failed.length > 0) {
        toast(`推送失败: ${res.failed[0].error}`, "error");
      } else {
        toast(`测试推送已发送（${res.success}/${res.total} 成功）`);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "测试推送失败", "error");
    } finally {
      setTesting(false);
    }
  };

  return (
    <Sec title="个推 (Getui) 离线推送">
      <p className="text-sm text-ink-muted mb-4">
        配置个推参数后，服务端将通过个推 REST API 向离线设备发送推送通知。
      </p>
      <Field label="AppID">
        <input
          type="text"
          value={getuiConfig.appId}
          onChange={(e) => setGetuiConfig({ ...getuiConfig, appId: e.target.value })}
          placeholder="个推应用 AppID"
          className="w-full rounded-lg border border-line-light bg-surface-soft px-3 py-2 text-sm"
        />
      </Field>
      <Field label="AppKey">
        <input
          type="text"
          value={getuiConfig.appKey}
          onChange={(e) => setGetuiConfig({ ...getuiConfig, appKey: e.target.value })}
          placeholder="个推应用 AppKey"
          className="w-full rounded-lg border border-line-light bg-surface-soft px-3 py-2 text-sm"
        />
      </Field>
      <Field label="AppSecret">
        <input
          type="password"
          value={getuiConfig.appSecret}
          onChange={(e) => setGetuiConfig({ ...getuiConfig, appSecret: e.target.value })}
          placeholder={getuiConfig.appSecret ? "已设置（输入新值覆盖）" : "个推应用 AppSecret"}
          className="w-full rounded-lg border border-line-light bg-surface-soft px-3 py-2 text-sm"
        />
      </Field>
      <Field label="MasterSecret">
        <input
          type="password"
          value={getuiConfig.masterSecret}
          onChange={(e) => setGetuiConfig({ ...getuiConfig, masterSecret: e.target.value })}
          placeholder={getuiConfig.masterSecret ? "已设置（输入新值覆盖）" : "个推应用 MasterSecret"}
          className="w-full rounded-lg border border-line-light bg-surface-soft px-3 py-2 text-sm"
        />
      </Field>

      <div className="mt-4 pt-4 border-t border-line-light/70 flex items-center gap-3">
        <button
          onClick={handleTest}
          disabled={testing}
          className="rounded-xl bg-ocean px-4 py-2 text-sm font-medium text-white hover:bg-ocean/90 disabled:opacity-50"
        >
          {testing ? "发送中..." : "发送测试推送"}
        </button>
      </div>

      <div className="mt-6 pt-4 border-t border-line-light/70">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">已注册设备 ({tokens.length})</h3>
          <button
            onClick={loadTokens}
            disabled={loadingTokens}
            className="text-xs text-ocean hover:text-ocean/80 disabled:opacity-50"
          >
            <RefreshCw className={`inline h-3.5 w-3.5 mr-1 ${loadingTokens ? "animate-spin" : ""}`} />
            刷新
          </button>
        </div>
        {loadingTokens ? (
          <div className="flex justify-center py-6">
            <RefreshCw className="h-5 w-5 animate-spin text-ink-muted" />
          </div>
        ) : tokens.length === 0 ? (
          <p className="text-sm text-ink-muted py-6 text-center">
            尚无设备注册。请安装 APK 并登录，个推 CID 会自动注册到此处。
          </p>
        ) : (
          <div className="space-y-2">
            {tokens.map((t, i) => (
              <div key={t.token + i} className="flex items-center justify-between rounded-lg bg-surface-soft px-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{t.display_name || t.username || t.user_id}</div>
                  <div className="truncate text-xs text-ink-muted font-mono">{t.token.substring(0, 24)}...</div>
                </div>
                <div className="ml-3 shrink-0 text-xs text-ink-muted">
                  {new Date(t.created_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Sec>
  );
}