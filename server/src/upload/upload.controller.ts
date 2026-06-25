import { Body, Controller, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger'
import { memoryStorage } from 'multer'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import type { RequestWithContext } from '../common/utils/request-context'
import { UploadService } from './upload.service'

@ApiTags('upload')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('image')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (!file.mimetype.startsWith('image/')) {
        cb(new Error('only image files are allowed'), false)
        return
      }
      cb(null, true)
    },
  }))
  uploadImage(
    @Req() request: RequestWithContext,
    @UploadedFile() file: Express.Multer.File,
    @Body('bizType') bizType?: string,
    @Body('bizId') bizId?: string,
  ) {
    return this.uploadService.saveImage(file, {
      bizType,
      bizId,
      user: request.user,
    })
  }
}
