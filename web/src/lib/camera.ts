/** 调用系统相机拍照，返回 data URL。 */
export async function takePhoto(): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new Error("No photo taken"));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    };
    input.onerror = () => reject(new Error("Camera cancelled"));
    input.click();
  });
}

/** 从相册选择多张图片，返回 data URL 数组。 */
export async function pickFromGallery(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      const pending = files.map(
        (f) =>
          new Promise<string>((res, rej) => {
            const reader = new FileReader();
            reader.onload = () => res(reader.result as string);
            reader.onerror = () => rej(reader.error);
            reader.readAsDataURL(f);
          }),
      );
      Promise.all(pending).then(resolve).catch(reject);
    };
    input.onerror = () => reject(new Error("Gallery cancelled"));
    input.click();
  });
}
