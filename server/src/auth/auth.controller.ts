import { Body, Controller, Get, HttpCode, Inject, Put, Post, Req, UseGuards } from '@nestjs/common'
import type { RequestWithContext } from '../common/utils/request-context'
import { AuthService } from './auth.service'
import { MockLoginDto } from './dto/mock-login.dto'
import { UpdateProfileDto } from './dto/update-profile.dto'
import { WechatLoginDto } from './dto/wechat-login.dto'
import { JwtAuthGuard } from './jwt-auth.guard'

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('mock-login')
  @HttpCode(200)
  mockLogin(@Body() dto: MockLoginDto) {
    return this.authService.mockLogin(dto.phone)
  }

  @Post('wechat-login')
  @HttpCode(200)
  wechatLogin(@Body() dto: WechatLoginDto) {
    return this.authService.wechatLogin(dto.loginCode, dto.phoneCode)
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@Req() request: RequestWithContext) {
    return this.authService.getMe(request.user!.userId)
  }

  @Put('profile')
  @UseGuards(JwtAuthGuard)
  updateProfile(@Req() request: RequestWithContext, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(request.user!.userId, dto)
  }

  @Post('dev-staff-session')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  createDevStaffSession(@Req() request: RequestWithContext) {
    return this.authService.createDevStaffSession(request.user!.userId)
  }
}
