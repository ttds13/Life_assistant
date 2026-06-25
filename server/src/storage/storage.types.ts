export type UploadActorType = 'user' | 'staff' | 'admin'

export interface UploadActor {
  uploaderType: UploadActorType
  uploaderId: number
}

export interface PutImageInput {
  buffer: Buffer
  mimeType: string
  originalName?: string
  bizType?: string
  bizId?: string | number
  actor: UploadActor
}

export interface PutImageResult {
  url: string
  signedUrl: string
  storageKey: string
  mimeType: string
  size: number
  expiresIn: number
}
