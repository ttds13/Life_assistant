import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common'
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { getRequestId, RequestWithContext } from '../common/utils/request-context'
import { AddressesService } from './addresses.service'
import { AdminSaveAddressDto } from './dto/save-address.dto'

@Controller('admin/addresses')
@UseGuards(AdminAuthGuard)
export class AdminAddressesController {
  constructor(@Inject(AddressesService) private readonly addressesService: AddressesService) {}

  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.addressesService.listAdminAddresses({
      ownerType: this.optionalString(query.ownerType),
      ownerId: this.optionalNumber(query.ownerId),
      addressType: this.optionalString(query.addressType),
      keyword: this.optionalString(query.keyword || query.keywords),
      city: this.optionalString(query.city),
      district: this.optionalString(query.district),
      page: this.positiveInt(query.page || query.pageNum, 1, 100000),
      pageSize: this.positiveInt(query.pageSize, 20, 100),
    })
  }

  @Get(':id')
  get(@Param('id') idText: string) {
    return this.addressesService.getAdminAddress(this.parseId(idText))
  }

  @Post()
  @HttpCode(200)
  create(@Req() request: RequestWithContext, @Body() dto: AdminSaveAddressDto) {
    return this.addressesService.createAdminAddress(dto, this.context(request))
  }

  @Put(':id')
  update(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: AdminSaveAddressDto) {
    return this.addressesService.updateAdminAddress(this.parseId(idText), dto, this.context(request))
  }

  @Delete(':id')
  @HttpCode(200)
  delete(@Req() request: RequestWithContext, @Param('id') idText: string) {
    return this.addressesService.deleteAdminAddress(this.parseId(idText), this.context(request))
  }

  private parseId(value: string) {
    const id = Number(value)
    if (!Number.isInteger(id) || id < 1) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid id', 400)
    }
    return id
  }

  private positiveInt(value: unknown, fallback: number, max: number) {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 1) return fallback
    return Math.min(parsed, max)
  }

  private optionalNumber(value: unknown) {
    if (value === undefined || value === null || value === '') return undefined
    const number = Number(value)
    return Number.isInteger(number) && number > 0 ? number : undefined
  }

  private optionalString(value: unknown) {
    if (value === undefined || value === null) return undefined
    const text = String(value).trim()
    return text || undefined
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
