import { UserRoundCheck, X } from "lucide-react";
import { useChatStore } from "../lib/store";
import { wsClient } from "../lib/ws-client";
import { useT } from "../lib/i18n";

/** 对方通过「你还在吗？」发起的在线确认弹窗 */
export function PresencePingModal() {
  const t = useT();
  const ping = useChatStore((s) => s.presencePing);
  const clearPresencePing = useChatStore((s) => s.clearPresencePing);

  if (!ping) return null;

  const respond = (): void => {
    wsClient.send({
      type: "presence:pong",
      conversationId: ping.conversationId,
      pingId: ping.pingId,
      toUserId: ping.fromUserId,
    });
    clearPresencePing();
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={clearPresencePing}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-line-light/70 bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line-light/70 px-5 py-3">
          <div className="flex items-center gap-2">
            <UserRoundCheck className="h-5 w-5 text-ocean" />
            <h3 className="font-display text-lg font-semibold text-ink-primary">{t("chat.areYouThere")}</h3>
          </div>
          <button
            type="button"
            onClick={clearPresencePing}
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-soft hover:text-ink-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <p className="text-sm leading-relaxed text-ink-secondary">
            {t("chat.areYouTherePrompt", { name: ping.fromName })}
          </p>
          <button
            type="button"
            onClick={respond}
            className="btn-primary w-full justify-center"
          >
            {t("chat.imHere")}
          </button>
        </div>
      </div>
    </div>
  );
}
