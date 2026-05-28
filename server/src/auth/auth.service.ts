import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { UsersRepository, UserProfileRecord } from '../users/users.repository'
import type { UpdateProfileDto } from './dto/update-profile.dto'

@Injectable()
export class AuthService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(UsersRepository) private readonly users: UsersRepository,
  ) {}

  async mockLogin(phone: string) {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new BusinessException(ErrorCode.AUTH_FORBIDDEN, '生产环境禁用模拟登录', 403)
    }

    let user = await this.users.findUserByPhone(phone)
    if (!user) {
      user = await this.users.createUser({
        phone,
        nickname: `用户_${phone.slice(-6)}`,
        avatar: '',
      })
    }

    if (user.status !== 1) {
      throw new BusinessException(ErrorCode.AUTH_USER_DISABLED, '账号已被禁用', 403)
    }

    return {
      ...await this.signToken(user),
      user: this.formatUser(user),
    }
  }

  async wechatLogin(loginCode: string, phoneCode: string) {
    const { openid, unionid } = await this.callWechatCode2Session(loginCode)
    const phone = await this.callWechatGetPhoneNumber(phoneCode)

    let user = await this.users.findUserByPhone(phone)
    if (!user) {
      user = await this.users.findUserByOpenid(openid)
    }
    if (!user) {
      user = await this.users.createUser({
        phone,
        nickname: `用户_${phone.slice(-6)}`,
        avatar: '',
        openid,
        unionid,
      })
    }

    if (user.status !== 1) {
      throw new BusinessException(ErrorCode.AUTH_USER_DISABLED, '账号已被禁用', 403)
    }

    if (!user.openid || user.openid !== openid || unionid) {
      user = await this.users.updateUser(user.id, { openid, unionid }) || user
    }

    return {
      ...await this.signToken(user),
      user: this.formatUser(user),
    }
  }

  async getMe(userId: number) {
    const user = await this.users.findUserById(userId)
    if (!user) {
      throw new BusinessException(ErrorCode.AUTH_NOT_LOGIN, '用户不存在', 401)
    }
    return this.formatUser(user)
  }

  async updateProfile(userId: number, dto: UpdateProfileDto) {
    const fields: UpdateProfileDto = {}
    if (dto.nickname !== undefined) fields.nickname = dto.nickname.trim()
    if (dto.avatar !== undefined) fields.avatar = dto.avatar.trim()

    const user = await this.users.updateUser(userId, fields)
    if (!user) {
      throw new BusinessException(ErrorCode.AUTH_NOT_LOGIN, '用户不存在', 401)
    }
    return this.formatUser(user)
  }

  private async signToken(user: UserProfileRecord) {
    const expiresIn = Number(this.config.get<string | number>('JWT_EXPIRES_IN', 604800))
    const accessToken = await this.jwt.signAsync(
      { userId: user.id, phone: user.phone, role: user.role },
      { expiresIn },
    )
    return { accessToken, expiresIn }
  }

  private maskPhone(phone: string) {
    if (!phone || phone.length < 7) return phone
    return `${phone.slice(0, 3)}****${phone.slice(-4)}`
  }

  private formatUser(user: UserProfileRecord) {
    return {
      id: user.id,
      phone: this.maskPhone(user.phone),
      nickname: user.nickname,
      avatar: user.avatar,
      role: user.role,
    }
  }

  private async callWechatCode2Session(loginCode: string): Promise<{ openid: string, unionid: string }> {
    const appid = this.config.get<string>('WECHAT_APPID', '')
    const secret = this.config.get<string>('WECHAT_SECRET', '')
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appid}&secret=${secret}&js_code=${loginCode}&grant_type=authorization_code`
    const response = await fetch(url)
    const data = await response.json() as Record<string, string | number>
    if (data.errcode) {
      throw new BusinessException(ErrorCode.AUTH_WECHAT_FAIL, `微信登录失败: ${data.errmsg || data.errcode}`, 400)
    }
    return {
      openid: String(data.openid || ''),
      unionid: String(data.unionid || ''),
    }
  }

  private async callWechatGetPhoneNumber(phoneCode: string): Promise<string> {
    const appid = this.config.get<string>('WECHAT_APPID', '')
    const secret = this.config.get<string>('WECHAT_SECRET', '')
    const tokenUrl = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appid}&secret=${secret}`
    const tokenResponse = await fetch(tokenUrl)
    const tokenData = await tokenResponse.json() as Record<string, string | number>
    if (tokenData.errcode) {
      throw new BusinessException(ErrorCode.AUTH_WECHAT_FAIL, `获取 access_token 失败: ${tokenData.errmsg || tokenData.errcode}`, 400)
    }

    const phoneUrl = `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${tokenData.access_token}`
    const phoneResponse = await fetch(phoneUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: phoneCode }),
    })
    const phoneData = await phoneResponse.json() as {
      errcode?: number
      errmsg?: string
      phone_info?: {
        purePhoneNumber?: string
        phoneNumber?: string
      }
    }
    if (phoneData.errcode) {
      throw new BusinessException(ErrorCode.AUTH_PHONE_REQUIRED, `获取手机号失败: ${phoneData.errmsg || phoneData.errcode}`, 400)
    }

    const phone = phoneData.phone_info?.purePhoneNumber || phoneData.phone_info?.phoneNumber
    if (!phone) {
      throw new BusinessException(ErrorCode.AUTH_PHONE_REQUIRED, '获取手机号失败', 400)
    }
    return phone
  }
}
