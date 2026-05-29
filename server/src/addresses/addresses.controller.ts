import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Req, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import type { RequestWithContext } from '../common/utils/request-context'
import { AddressesService } from './addresses.service'
import { SaveAddressDto } from './dto/save-address.dto'

@Controller('user/addresses')
@UseGuards(JwtAuthGuard)
export class AddressesController {
  constructor(@Inject(AddressesService) private readonly addressesService: AddressesService) {}

  @Get()
  list(@Req() request: RequestWithContext) {
    return this.addressesService.listUserAddresses(request.user!.userId)
  }

  @Post()
  @HttpCode(200)
  create(@Req() request: RequestWithContext, @Body() dto: SaveAddressDto) {
    return this.addressesService.createUserAddress(request.user!.userId, dto)
  }

  @Put(':id')
  update(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: SaveAddressDto) {
    return this.addressesService.updateUserAddress(request.user!.userId, this.parseId(idText), dto)
  }

  @Delete(':id')
  delete(@Req() request: RequestWithContext, @Param('id') idText: string) {
    return this.addressesService.deleteUserAddress(request.user!.userId, this.parseId(idText))
  }

  private parseId(value: string) {
    const id = Number(value)
    if (!Number.isInteger(id) || id < 1) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid id', 400)
    }
    return id
  }
}
