import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { StaffIdentityService } from '../auth/staff-identity.service'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import type { RequestWithContext } from '../common/utils/request-context'
import { AddressesService } from './addresses.service'
import { SaveAddressDto } from './dto/save-address.dto'

@Controller('staff/addresses')
@UseGuards(JwtAuthGuard)
export class StaffAddressesController {
  constructor(
    @Inject(AddressesService) private readonly addressesService: AddressesService,
    @Inject(StaffIdentityService) private readonly staffIdentity: StaffIdentityService,
  ) {}

  @Get()
  async list(@Req() request: RequestWithContext, @Query('addressType') addressType?: string) {
    return this.addressesService.listAddresses({
      ownerType: 'staff',
      ownerId: await this.parseStaffId(request),
      addressType,
    })
  }

  @Get(':id')
  async get(@Req() request: RequestWithContext, @Param('id') idText: string, @Query('addressType') addressType?: string) {
    return this.addressesService.getAddress({
      ownerType: 'staff',
      ownerId: await this.parseStaffId(request),
      addressType,
      addressId: this.parseId(idText),
    })
  }

  @Post()
  @HttpCode(200)
  async create(@Req() request: RequestWithContext, @Body() dto: SaveAddressDto) {
    return this.addressesService.createAddress({
      ownerType: 'staff',
      ownerId: await this.parseStaffId(request),
      addressType: dto.addressType || 'home',
      dto,
    })
  }

  @Put(':id')
  async update(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: SaveAddressDto) {
    return this.addressesService.updateAddress({
      ownerType: 'staff',
      ownerId: await this.parseStaffId(request),
      addressId: this.parseId(idText),
      dto,
    })
  }

  @Delete(':id')
  async delete(@Req() request: RequestWithContext, @Param('id') idText: string, @Query('addressType') addressType?: string) {
    return this.addressesService.deleteAddress({
      ownerType: 'staff',
      ownerId: await this.parseStaffId(request),
      addressType,
      addressId: this.parseId(idText),
    })
  }

  private parseId(value: string) {
    const id = Number(value)
    if (!Number.isInteger(id) || id < 1) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid id', 400)
    }
    return id
  }

  private parseStaffId(request: RequestWithContext) {
    return this.staffIdentity.resolveStaffId(request)
  }
}
