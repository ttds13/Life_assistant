export interface FileInfo {
  id?: string | number;
  uuid?: string;
  name: string;
  url: string;
  signedUrl?: string;
  displayUrl?: string;
  storageKey?: string;
  bizType?: string;
  bizId?: string | number | null;
  mimeType?: string;
  size?: number;
  expiresIn?: number;
}
