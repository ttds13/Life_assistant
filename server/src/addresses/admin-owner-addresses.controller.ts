import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Req, UseGuards } from '@nestjs/common'
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard'
import { RequireAdminPermissions } from '../admin-auth/admin-permission.decorator'
import { ADMIN_PERMISSION } from '../admin-auth/admin-permissions'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { getRequestId, RequestWithContext } from '../common/utils/request-context'
import { AddressesService } from './addresses.service'
import { SaveAddressDto } from './dto/save-address.dto'

@Controller('admin')
@UseGuards(AdminAuthGuard)
export class AdminOwnerAddressesController {
  constructor(@Inject(AddressesService) private readonly addressesService: AddressesService) {}

  @Get('users/:ownerId/addresses')
  @RequireAdminPermissions(ADMIN_PERMISSION.ADDRESS_LIST)
  listUserAddresses(@Param('ownerId') ownerIdText: string) {
    return this.addressesService.listAdminAddresses({
      ownerType: 'user',
      ownerId: this.parseId(ownerIdText),
      page: 1,
      pageSize: 100,
    })
  }

  @Get('users/:ownerId/addresses/:addressId')
  @RequireAdminPermissions(ADMIN_PERMISSION.ADDRESS_LIST)
  getUserAddress(@Param('ownerId') ownerIdText: string, @Param('addressId') addressIdText: string) {
    return this.addressesService.getAdminOwnerAddress('user', this.parseId(ownerIdText), this.parseId(addressIdText))
  }

  @Post('users/:ownerId/addresses')
  @RequireAdminPermissions(ADMIN_PERMISSION.ADDRESS_CREATE)
  @HttpCode(200)
  createUserAddress(@Req() request: RequestWithContext, @Param('ownerId') ownerIdText: string, @Body() dto: SaveAddressDto) {
    return this.addressesService.createAdminAddress({
      ...dto,
      ownerType: 'user',
      ownerId: this.parseId(ownerIdText),
      addressType: dto.addressType || 'service',
    }, this.context(request))
  }

  @Put('users/:ownerId/addresses/:addressId')
  @RequireAdminPermissions(ADMIN_PERMISSION.ADDRESS_UPDATE)
  updateUserAddress(
    @Req() request: RequestWithContext,
    @Param('ownerId') ownerIdText: string,
    @Param('addressId') addressIdText: string,
    @Body() dto: SaveAddressDto,
  ) {
    return this.addressesService.updateAdminOwnerAddress('user', this.parseId(ownerIdText), this.parseId(addressIdText), {
      ...dto,
      addressType: dto.addressType || 'service',
    }, this.context(request))
  }

  @Delete('users/:ownerId/addresses/:addressId')
  @RequireAdminPermissions(ADMIN_PERMISSION.ADDRESS_DELETE)
  @HttpCode(200)
  deleteUserAddress(@Req() request: RequestWithContext, @Param('ownerId') ownerIdText: string, @Param('addressId') addressIdText: string) {
    return this.addressesService.deleteAdminOwnerAddress('user', this.parseId(ownerIdText), this.parseId(addressIdText), this.context(request))
  }

  @Get('staff/:ownerId/addresses')
  @RequireAdminPermissions(ADMIN_PERMISSION.ADDRESS_LIST)
  listStaffAddresses(@Param('ownerId') ownerIdText: string) {
    return this.addressesService.listAdminAddresses({
      ownerType: 'staff',
      ownerId: this.parseId(ownerIdText),
      page: 1,
      pageSize: 100,
    })
  }

  @Get('staff/:ownerId/addresses/:addressId')
  @RequireAdminPermissions(ADMIN_PERMISSION.ADDRESS_LIST)
  getStaffAddress(@Param('ownerId') ownerIdText: string, @Param('addressId') addressIdText: string) {
    return this.addressesService.getAdminOwnerAddress('staff', this.parseId(ownerIdText), this.parseId(addressIdText))
  }

  @Post('staff/:ownerId/addresses')
  @RequireAdminPermissions(ADMIN_PERMISSION.ADDRESS_CREATE)
  @HttpCode(200)
  createStaffAddress(@Req() request: RequestWithContext, @Param('ownerId') ownerIdText: string, @Body() dto: SaveAddressDto) {
    return this.addressesService.createAdminAddress({
      ...dto,
      ownerType: 'staff',
      ownerId: this.parseId(ownerIdText),
      addressType: dto.addressType || 'home',
    }, this.context(request))
  }

  @Put('staff/:ownerId/addresses/:addressId')
  @RequireAdminPermissions(ADMIN_PERMISSION.ADDRESS_UPDATE)
  updateStaffAddress(
    @Req() request: RequestWithContext,
    @Param('ownerId') ownerIdText: string,
    @Param('addressId') addressIdText: string,
    @Body() dto: SaveAddressDto,
  ) {
    return this.addressesService.updateAdminOwnerAddress('staff', this.parseId(ownerIdText), this.parseId(addressIdText), {
      ...dto,
      addressType: dto.addressType || 'home',
    }, this.context(request))
  }

  @Delete('staff/:ownerId/addresses/:addressId')
  @RequireAdminPermissions(ADMIN_PERMISSION.ADDRESS_DELETE)
  @HttpCode(200)
  deleteStaffAddress(@Req() request: RequestWithContext, @Param('ownerId') ownerIdText: string, @Param('addressId') addressIdText: string) {
    return this.addressesService.deleteAdminOwnerAddress('staff', this.parseId(ownerIdText), this.parseId(addressIdText), this.context(request))
  }

  private parseId(value: string) {
    const id = Number(value)
    if (!Number.isInteger(id) || id < 1) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid id', 400)
    }
    return id
  }

  private context(request: RequestWithContext) {
    const adminId = request.user?.adminId || request.user?.userId
    if (!adminId) {
      throw new BusinessException(ErrorCode.AUTH_FORBIDDEN, 'missing admin identity', 403)
    }
    return {
      adminId,
      requestId: getRequestId(request),
      ip: this.getClientIp(request),
    }
  }

  private getClientIp(request: RequestWithContext) {
    const forwardedFor = request.headers['x-forwarded-for']
    if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
      return forwardedFor.split(',')[0].trim()
    }
    if (Array.isArray(forwardedFor) && forwardedFor[0]) {
      return forwardedFor[0].split(',')[0].trim()
    }
    return request.ip
  }
}
