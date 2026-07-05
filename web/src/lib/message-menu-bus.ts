/**
 * 消息气泡右键/长按菜单的全局单例状态。
 * 每个 MessageBubble 组件持有自己的 `menuPos`，但通过本总线保证：
 *   1. 同时只有一个气泡的菜单处于打开状态。
 *   2. 点击空白处或右键其它气泡时，所有菜单自动关闭。
 *   3. 滚轮、滚动、消息列表重渲染等场景下，菜单不会"残留"在错误位置。
 */

type Listener = (ownerId: string | null, pos: { x: number; y: number } | null) => void;

class MessageMenuBus {
  private ownerId: string | null = null;
  private pos: { x: number; y: number } | null = null;
  private listeners = new Set<Listener>();

  /** 获取当前打开菜单的气泡 id；没有则返回 null。 */
  getOwnerId(): string | null {
    return this.ownerId;
  }

  /** 当前打开菜单的位置；没有则返回 null。 */
  getPos(): { x: number; y: number } | null {
    return this.pos;
  }

  /** 打开一个气泡的菜单：传入气泡 id 与鼠标/触点位置。 */
  open(ownerId: string, pos: { x: number; y: number }): void {
    this.ownerId = ownerId;
    this.pos = pos;
    for (const fn of this.listeners) fn(ownerId, pos);
  }

  /** 关闭指定气泡的菜单（一般用于"我自己主动关闭"）。 */
  close(ownerId?: string): void {
    if (ownerId && this.ownerId !== ownerId) return;
    if (this.ownerId === null) return;
    this.ownerId = null;
    this.pos = null;
    for (const fn of this.listeners) fn(null, null);
  }

  /** 强制关闭所有菜单（点击空白处、Escape 等场景）。 */
  closeAll(): void {
    if (this.ownerId === null) return;
    this.ownerId = null;
    this.pos = null;
    for (const fn of this.listeners) fn(null, null);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
}

export const messageMenuBus = new MessageMenuBus();
