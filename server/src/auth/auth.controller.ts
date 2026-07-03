import { Body, Controller, Delete, Get, HttpCode, Inject, Post, Put, Req, UseGuards } from '@nestjs/common'
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
  mockLogin(@Body() dto: MockLoginDto, @Req() request: RequestWithContext) {
    return this.authService.mockLogin(dto.phone, request)
  }

  @Post('wechat-login')
  @HttpCode(200)
  wechatLogin(@Body() dto: WechatLoginDto, @Req() request: RequestWithContext) {
    return this.authService.wechatLogin(dto.loginCode, dto.phoneCode, request)
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: { refreshToken?: string }, @Req() request: RequestWithContext) {
    return this.authService.refresh(dto?.refreshToken, request)
  }

  @Delete('logout')
  @HttpCode(200)
  logout(@Body() dto: { refreshToken?: string }) {
    return this.authService.logout(dto?.refreshToken)
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
}
