import { motion } from "framer-motion";
import type { PublicUser } from "@navo/shared";
import { Avatar } from "./Avatar";
import { useT } from "../lib/i18n";

interface TypingIndicatorProps {
  users: PublicUser[];
}

export function TypingIndicator({ users }: TypingIndicatorProps) {
  const t = useT();
  if (users.length === 0) return null;
  const label =
    users.length === 1
      ? t("chat.typing", { name: users[0].displayName })
      : t("chat.typingMultiple", {
          names: users.slice(0, 2).map((u) => u.displayName).join("、"),
          count: users.length,
        });

  return (
    <div className="flex items-center gap-3 text-xs text-ink-secondary">
      <div className="flex -space-x-2">
        {users.slice(0, 3).map((u) => (
          <Avatar key={u.id} user={u} size="xs" ring />
        ))}
      </div>
      <div className="flex items-center gap-2 rounded-full border border-line-light bg-surface px-3 py-1.5 shadow-soft">
        <span>{label}</span>
        <span className="flex gap-0.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="block h-1.5 w-1.5 rounded-full bg-ocean"
              animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.12 }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
