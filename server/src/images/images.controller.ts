import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Query, Req, UseGuards } from '@nestjs/common'
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard'
import { RequireAdminPermissions } from '../admin-auth/admin-permission.decorator'
import { ADMIN_PERMISSION } from '../admin-auth/admin-permissions'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import type { RequestWithContext } from '../common/utils/request-context'
import type { QueryImagesDto } from './dto/query-images.dto'
import type { UpdateImageDto } from './dto/update-image.dto'
import { ImagesService } from './images.service'

@Controller('admin/images')
@UseGuards(AdminAuthGuard)
export class ImagesController {
  constructor(@Inject(ImagesService) private readonly images: ImagesService) {}

  @Get()
  @RequireAdminPermissions(ADMIN_PERMISSION.IMAGE_LIST)
  listImages(@Query() query: QueryImagesDto) {
    return this.images.listImages(query)
  }

  @Get(':id')
  @RequireAdminPermissions(ADMIN_PERMISSION.IMAGE_DETAIL)
  getImage(@Param('id') idText: string) {
    return this.images.getImage(this.parseId(idText))
  }

  @Get(':id/references')
  @RequireAdminPermissions(ADMIN_PERMISSION.IMAGE_DETAIL)
  getReferences(@Param('id') idText: string) {
    return this.images.getReferences(this.parseId(idText))
  }

  @Patch(':id')
  @RequireAdminPermissions(ADMIN_PERMISSION.IMAGE_UPDATE)
  updateImage(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: UpdateImageDto) {
    return this.images.updateImage(this.parseId(idText), dto, this.context(request))
  }

  @Delete(':id')
  @RequireAdminPermissions(ADMIN_PERMISSION.IMAGE_DELETE)
  @HttpCode(200)
  deleteImage(@Req() request: RequestWithContext, @Param('id') idText: string) {
    return this.images.deleteImage(this.parseId(idText), this.context(request))
  }

  private parseId(value: string) {
    const id = Number(value)
    if (!Number.isInteger(id) || id < 1) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid id', 400)
    }
    return id
  }

  private context(request: RequestWithContext) {
    const user = request.user
    const adminId = user?.adminId || user?.userId
    if (!user || !adminId) {
      throw new BusinessException(ErrorCode.AUTH_FORBIDDEN, 'admin context missing', 403)
    }
    return { ...user, adminId }
  }
}
