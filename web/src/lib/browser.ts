/** 在浏览器新标签页打开 URL。 */
export function openUrl(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}
