export interface ImageRecord {
  id: string;
  uuid: string;
  filename: string;
  url: string;
  displayUrl: string;
  signedUrl?: string;
  storageKey: string;
  bizType: string;
  bizId: string;
  uploaderType: string;
  uploaderId: string;
  source: string;
  visibility: string;
  alt: string;
  remark: string;
  mimeType: string;
  size: number;
  status: string;
  referenceCount: number;
  references?: ImageReference[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  deletedBy?: string;
}

export interface ImageReference {
  type: string;
  table: string;
  field: string;
  recordId: number;
  title: string;
  adminPath?: string;
}

export interface QueryImagesParams {
  page?: number;
  pageNum?: number;
  pageSize?: number;
  keyword?: string;
  bizType?: string;
  bizId?: string;
  uploaderType?: string;
  uploaderId?: string;
  source?: string;
  status?: string;
  dateStart?: string;
  dateEnd?: string;
  onlyOrphaned?: boolean;
}

export interface ImagePageResult {
  items: ImageRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UpdateImagePayload {
  alt?: string;
  remark?: string;
  status?: string;
}
