import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { PrismaService } from '../prisma/prisma.service'
import { ObjectStorageService } from '../storage/storage.service'
import { IMAGE_BIZ_TYPE } from '../storage/image-biz-types'
import { getAdminPermissions, getAdminRoles, normalizeAdminRole } from './admin-permissions'
import { verifyAdminPassword } from './admin-password'
import type { AdminLoginDto } from './dto/admin-login.dto'

@Injectable()
export class AdminAuthService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ObjectStorageService) private readonly storage: ObjectStorageService,
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

    const avatarUrls = this.storage.resolveAvatarUrls(admin.avatarUrl)
    return {
      userId: String(admin.id),
      username: admin.username,
      nickname: admin.name,
      avatar: avatarUrls.avatar,
      avatarOssUrl: avatarUrls.avatarOssUrl,
      avatarDisplayUrl: avatarUrls.avatarDisplayUrl,
      roles: getAdminRoles(admin.role),
      perms: getAdminPermissions(admin.role),
    }
  }

  async getProfile(adminId: number) {
    const admin = await this.prisma.adminUser.findUnique({ where: { id: BigInt(adminId) } })
    if (!admin || admin.status !== 1) {
      throw new BusinessException(ErrorCode.AUTH_NOT_LOGIN, '管理员不存在或已禁用', 401)
    }

    const avatarUrls = this.storage.resolveAvatarUrls(admin.avatarUrl)
    return {
      id: String(admin.id),
      username: admin.username,
      nickname: admin.name,
      avatar: avatarUrls.avatar,
      avatarOssUrl: avatarUrls.avatarOssUrl,
      avatarDisplayUrl: avatarUrls.avatarDisplayUrl,
      mobile: admin.phone || '',
      roleNames: getAdminRoles(admin.role).join(','),
      createTime: admin.createdAt,
    }
  }

  async updateProfile(adminId: number, dto: { nickname?: string, avatar?: string, gender?: number }) {
    const data: { name?: string, avatarUrl?: string } = {}
    if (dto.nickname !== undefined) {
      const nickname = dto.nickname.trim()
      if (!nickname) {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'nickname cannot be empty', 400)
      }
      if (nickname.length > 20) {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'nickname too long', 400)
      }
      data.name = nickname
    }
    if (dto.avatar !== undefined) {
      const avatar = dto.avatar.trim()
      this.storage.assertPermanentOssUrl(avatar, { force: true })
      data.avatarUrl = avatar
    }

    if (Object.keys(data).length) {
      await this.prisma.adminUser.update({
        where: { id: BigInt(adminId) },
        data,
      })
      if (data.avatarUrl) {
        await this.storage.bindFilesToBiz([data.avatarUrl], IMAGE_BIZ_TYPE.ADMIN_AVATAR, adminId)
      }
    }
    return this.getProfile(adminId)
  }

  logout() {
    return {}
  }
}
