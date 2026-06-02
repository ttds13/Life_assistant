import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import type { RequestWithContext } from '../common/utils/request-context'

interface TokenPayload {
  userId: number
  adminId?: number
  phone?: string
  username?: string
  role?: string
  userType?: string
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(JwtService) private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithContext>()
    const token = this.extractToken(request)
    if (!token) {
      throw new BusinessException(ErrorCode.AUTH_NOT_LOGIN, '未登录或 token 已过期', 401)
    }

    try {
      const payload = await this.jwt.verifyAsync<TokenPayload>(token)
      const isAdmin = payload.userType === 'admin' && payload.adminId
      const user = {
        userId: Number(isAdmin ? payload.adminId : payload.userId),
        adminId: payload.adminId ? Number(payload.adminId) : undefined,
        phone: payload.phone,
        username: payload.username,
        role: payload.role || 'user',
        userType: isAdmin ? 'admin' as const : 'user' as const,
      }
      request.user = user
      request.context = {
        ...(request.context || { requestId: 'req_unknown', source: 'unknown', clientVersion: '' }),
        user,
      }
      return true
    }
    catch (error) {
      if (error instanceof Error && error.name === 'TokenExpiredError') {
        throw new BusinessException(ErrorCode.AUTH_NOT_LOGIN, '登录已过期，请重新登录', 401)
      }
      throw new BusinessException(ErrorCode.AUTH_INVALID_TOKEN, 'token 无效', 401)
    }
  }

  private extractToken(request: RequestWithContext): string | null {
    const header = request.headers.authorization
    if (!header || !header.startsWith('Bearer ')) return null
    return header.slice(7)
  }
}
