import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import type { RequestWithContext } from '../common/utils/request-context'
import { PrismaService } from '../prisma/prisma.service'
import { ADMIN_PERMISSION_KEY } from './admin-permission.decorator'
import { getAdminPermissions, getAdminRoles } from './admin-permissions'

export interface AdminTokenPayload {
  adminId: number
  username: string
  role: string
  userType: 'admin'
}

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithContext>()
    const token = this.extractToken(request)
    if (!token) {
      throw new BusinessException(ErrorCode.AUTH_NOT_LOGIN, 'admin token missing or expired', 401)
    }

    try {
      const payload = await this.jwt.verifyAsync<AdminTokenPayload>(token)
      if (payload.userType !== 'admin' || !payload.adminId) {
        throw new BusinessException(ErrorCode.AUTH_FORBIDDEN, 'admin access denied', 403)
      }

      const admin = await this.prisma.adminUser.findUnique({
        where: { id: BigInt(payload.adminId) },
        select: { id: true, username: true, role: true, status: true },
      })
      if (!admin || admin.status !== 1) {
        throw new BusinessException(ErrorCode.AUTH_NOT_LOGIN, 'admin account disabled or missing', 401)
      }

      const perms = getAdminPermissions(admin.role)
      const requiredPerms = this.reflector.getAllAndOverride<string[]>(ADMIN_PERMISSION_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) || []
      if (requiredPerms.length && !this.hasPermissions(perms, requiredPerms)) {
        throw new BusinessException(ErrorCode.AUTH_FORBIDDEN, 'admin permission denied', 403, { requiredPerms })
      }

      const user = {
        userId: Number(admin.id),
        adminId: Number(admin.id),
        username: admin.username || payload.username,
        role: admin.role,
        roles: getAdminRoles(admin.role),
        perms,
        userType: 'admin' as const,
      }
      request.user = user
      request.context = {
        ...(request.context || { requestId: 'req_unknown', source: 'unknown', clientVersion: '' }),
        user,
      }
      return true
    }
    catch (error) {
      if (error instanceof BusinessException) throw error
      if (error instanceof Error && error.name === 'TokenExpiredError') {
        throw new BusinessException(ErrorCode.AUTH_NOT_LOGIN, 'admin token expired', 401)
      }
      throw new BusinessException(ErrorCode.AUTH_INVALID_TOKEN, 'admin token invalid', 401)
    }
  }

  private extractToken(request: RequestWithContext): string | null {
    const header = request.headers.authorization
    if (!header || !header.startsWith('Bearer ')) return null
    return header.slice(7)
  }

  private hasPermissions(current: string[], required: string[]) {
    if (current.includes('*')) return true
    return required.every(permission => current.includes(permission))
  }
}
