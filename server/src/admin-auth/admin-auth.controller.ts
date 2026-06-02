import { Body, Controller, Delete, Get, HttpCode, Inject, Post, Req, UseGuards } from '@nestjs/common'
import type { RequestWithContext } from '../common/utils/request-context'
import { AdminAuthGuard } from './admin-auth.guard'
import { AdminAuthService } from './admin-auth.service'
import { AdminLoginDto } from './dto/admin-login.dto'

@Controller('admin/auth')
export class AdminAuthController {
  constructor(@Inject(AdminAuthService) private readonly adminAuthService: AdminAuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: AdminLoginDto) {
    return this.adminAuthService.login(dto)
  }

  @Get('me')
  @UseGuards(AdminAuthGuard)
  getMe(@Req() request: RequestWithContext) {
    return this.adminAuthService.getMe(request.user!.adminId!)
  }

  @Delete('logout')
  @UseGuards(AdminAuthGuard)
  logout() {
    return this.adminAuthService.logout()
  }
}
