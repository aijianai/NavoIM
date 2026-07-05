function isHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

/** 在页面后台时显示浏览器通知。 */
export async function showNotification(
  title: string,
  body: string,
  _data?: Record<string, unknown>,
): Promise<void> {
  if (!isHidden()) return;
  if (!("Notification" in window)) return;
  if (Notification.permission === "denied") return;
  if (Notification.permission === "default") {
    const result = await Notification.requestPermission();
    if (result !== "granted") return;
  }
  try {
    const n = new Notification(title, { body, icon: "/favicon.ico" });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // 浏览器不支持或用户拒绝
  }
}

/** 请求浏览器通知权限。 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

/** Web 端通知点击无额外路由，返回空清理函数。 */
export function onNotificationClick(_callback: (data: Record<string, unknown>) => void): () => void {
  return () => {};
}
