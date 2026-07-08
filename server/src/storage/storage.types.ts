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
  source?: string
  actor: UploadActor
}

export interface PutImageResult {
  id?: number
  uuid?: string
  url: string
  signedUrl: string
  displayUrl?: string
  storageKey: string
  bizType?: string
  bizId?: number | null
  mimeType: string
  size: number
  expiresIn: number
}
