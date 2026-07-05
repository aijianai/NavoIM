/** 触发浏览器下载指定 URL 的文件。 */
export async function downloadFile(url: string, fileName: string): Promise<void> {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

/** 将 Blob 保存为本地文件。 */
export async function saveBlob(blob: Blob, fileName: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  try {
    await downloadFile(url, fileName);
  } finally {
    URL.revokeObjectURL(url);
  }
}
