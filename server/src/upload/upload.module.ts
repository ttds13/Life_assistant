import { Module } from '@nestjs/common'
import { ServeStaticModule } from '@nestjs/serve-static'
import { ConfigModule, ConfigService } from '@nestjs/config'
import * as path from 'node:path'
import { AuthModule } from '../auth/auth.module'
import { StorageModule } from '../storage/storage.module'
import { UploadController } from './upload.controller'
import { UploadService } from './upload.service'

@Module({
  imports: [
    AuthModule,
    StorageModule,
    ServeStaticModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const uploadDir = config.get<string>('UPLOAD_DIR', 'uploads')
        const rootPath = path.isAbsolute(uploadDir)
          ? uploadDir
          : path.join(process.cwd(), uploadDir)
        const apiPrefix = config.get<string>('API_PREFIX', '/api').replace(/^\/?/, '/').replace(/\/$/, '')
        return [{
          rootPath,
          serveRoot: `${apiPrefix}/upload/files`,
          serveStaticOptions: { index: false },
        }]
      },
    }),
  ],
  controllers: [UploadController],
  providers: [UploadService],
})
export class UploadModule {}
