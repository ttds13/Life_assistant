import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import type { RequestWithContext } from '../common/utils/request-context'
import { UsersService } from './users.service'

@Controller('user')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(@Inject(UsersService) private readonly usersService: UsersService) {}

  @Get('points')
  getPoints(@Req() request: RequestWithContext) {
    return this.usersService.getUserPoints(request.user!.userId)
  }
}
