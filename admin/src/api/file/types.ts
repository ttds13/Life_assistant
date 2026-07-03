export interface FileInfo {
  name: string;
  url: string;
  signedUrl?: string;
  displayUrl?: string;
  storageKey?: string;
  mimeType?: string;
  size?: number;
  expiresIn?: number;
}
