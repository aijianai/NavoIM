/** 监听页面可见性变化（前后台切换）。 */
export function onAppStateChange(callback: (active: boolean) => void): () => void {
  callback(!document.hidden);
  const onChange = () => callback(!document.hidden);
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

/** 当前页面是否处于前台。 */
export async function getAppState(): Promise<boolean> {
  return !document.hidden;
}
