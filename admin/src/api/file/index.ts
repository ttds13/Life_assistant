import request from "@/utils/request";
import type { FileInfo } from "./types";

function normalizeFileInfo(file: Partial<FileInfo>): FileInfo {
  return {
    name: file.name || file.storageKey || file.url?.split("/").pop() || "",
    url: file.url || "",
    signedUrl: file.signedUrl,
    displayUrl: file.displayUrl || file.signedUrl || file.url,
    storageKey: file.storageKey,
    mimeType: file.mimeType,
    size: file.size,
    expiresIn: file.expiresIn,
  };
}

const FileAPI = {
  upload(formData: FormData, onProgress?: (percent: number) => void) {
    return request<unknown, FileInfo>({
      url: "/api/upload/image",
      method: "post",
      data: formData,
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress?.(percent);
        }
      },
    }).then(normalizeFileInfo);
  },

  uploadFile(file: File, data: Record<string, string> = {}) {
    const formData = new FormData();
    formData.append("file", file);
    Object.entries(data).forEach(([key, value]) => {
      formData.append(key, value);
    });
    return request<unknown, FileInfo>({
      url: "/api/upload/image",
      method: "post",
      data: formData,
      headers: { "Content-Type": "multipart/form-data" },
    }).then(normalizeFileInfo);
  },

  delete(_filePath?: string) {
    return Promise.resolve({});
  },

  download(url: string, fileName?: string) {
    return request({
      url,
      method: "get",
      responseType: "blob",
    }).then((res) => {
      const blob = new Blob([res.data]);
      const a = document.createElement("a");
      const urlObject = window.URL.createObjectURL(blob);
      a.href = urlObject;
      a.download = fileName || "download";
      a.click();
      window.URL.revokeObjectURL(urlObject);
    });
  },
};

export default FileAPI;
export * from "./types";
