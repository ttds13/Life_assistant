import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'

@Injectable()
export class UploadService {
  constructor(private readonly config: ConfigService) {}

  saveImage(file: Express.Multer.File) {
    const uploadDir = this.config.get<string>('UPLOAD_DIR', 'uploads')
    const absoluteDir = path.isAbsolute(uploadDir)
      ? uploadDir
      : path.join(process.cwd(), uploadDir)

    if (!fs.existsSync(absoluteDir)) {
      fs.mkdirSync(absoluteDir, { recursive: true })
    }

    const ext = path.extname(file.originalname) || '.jpg'
    const filename = `${crypto.randomUUID()}${ext}`
    const filepath = path.join(absoluteDir, filename)
    fs.writeFileSync(filepath, file.buffer)

    const baseUrl = this.config.get<string>('SERVER_BASE_URL', '')
    const apiPrefix = this.config.get<string>('API_PREFIX', '/api').replace(/^\/?/, '/').replace(/\/$/, '')
    const url = baseUrl
      ? `${baseUrl}${apiPrefix}/upload/files/${filename}`
      : `${apiPrefix}/upload/files/${filename}`

    return { url }
  }
}
