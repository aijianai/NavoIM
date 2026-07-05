import { useChatStore } from "../lib/store";
import { UserCard } from "./UserCard";

interface UserCardPopoverProps {
  userId: string;
  onClose: () => void;
}

export function UserCardPopover({ userId, onClose }: UserCardPopoverProps) {
  const user = useChatStore((s) => s.users[userId]);
  if (!user) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface-deep/50 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <UserCard user={user} onClose={onClose} />
      </div>
    </div>
  );
}
