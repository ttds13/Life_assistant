import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { PrismaService } from '../prisma/prisma.service'
import { getAdminPermissions, getAdminRoles, normalizeAdminRole } from './admin-permissions'
import { verifyAdminPassword } from './admin-password'
import type { AdminLoginDto } from './dto/admin-login.dto'

@Injectable()
export class AdminAuthService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async login(dto: AdminLoginDto) {
    const username = dto.username.trim()
    const admin = await this.prisma.adminUser.findUnique({ where: { username } })
    const isValid = admin
      ? await verifyAdminPassword(dto.password, admin.passwordHash)
      : false

    if (!admin || !isValid) {
      throw new BusinessException(ErrorCode.AUTH_INVALID_TOKEN, '账号或密码错误', 401)
    }
    if (admin.status !== 1) {
      throw new BusinessException(ErrorCode.AUTH_FORBIDDEN, '管理员账号已禁用', 403)
    }

    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    })

    const expiresIn = Number(this.config.get<string | number>('ADMIN_JWT_EXPIRES_IN', this.config.get<string | number>('JWT_EXPIRES_IN', 604800)))
    const role = normalizeAdminRole(admin.role)
    const accessToken = await this.jwt.signAsync(
      {
        adminId: Number(admin.id),
        username: admin.username,
        role,
        userType: 'admin',
      },
      { expiresIn },
    )

    return {
      accessToken,
      refreshToken: accessToken,
      tokenType: 'Bearer',
      expiresIn,
    }
  }

  async getMe(adminId: number) {
    const admin = await this.prisma.adminUser.findUnique({ where: { id: BigInt(adminId) } })
    if (!admin || admin.status !== 1) {
      throw new BusinessException(ErrorCode.AUTH_NOT_LOGIN, '管理员不存在或已禁用', 401)
    }

    return {
      userId: String(admin.id),
      username: admin.username,
      nickname: admin.name,
      avatar: '',
      roles: getAdminRoles(admin.role),
      perms: getAdminPermissions(admin.role),
    }
  }

  logout() {
    return {}
  }
}
