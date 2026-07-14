import { Inject, Injectable } from '@nestjs/common'
import type { User } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

export interface UserProfileRecord {
  id: number
  phone: string
  nickname: string
  avatar: string
  status: number
  role: 'user'
  openid: string
  createdAt: string
  updatedAt: string
}

@Injectable()
export class UsersRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findUserByPhone(phone: string): Promise<UserProfileRecord | null> {
    const users = await this.prisma.user.findMany({
      where: { phone, deletedAt: null },
      orderBy: { id: 'asc' },
      take: 2,
    })
    if (users.length > 1) {
      console.warn(JSON.stringify({
        level: 'warn',
        message: 'duplicate_active_user_phone',
        phone,
        count: users.length,
        timestamp: new Date().toISOString(),
      }))
    }
    return users[0] ? this.formatUser(users[0]) : null
  }

  async findUserById(id: number): Promise<UserProfileRecord | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: BigInt(id), deletedAt: null },
    })
    return user ? this.formatUser(user) : null
  }

  async findUserByOpenid(openid: string): Promise<UserProfileRecord | null> {
    const user = await this.prisma.user.findFirst({
      where: { openid, deletedAt: null },
    })
    return user ? this.formatUser(user) : null
  }

  async createUser(params: {
    phone?: string
    nickname?: string
    avatar?: string
    openid?: string
    unionid?: string
  }): Promise<UserProfileRecord> {
    const user = await this.prisma.user.create({
      data: {
        phone: params.phone,
        nickname: params.nickname || (params.phone ? `用户_${params.phone.slice(-6)}` : '微信用户'),
        avatarUrl: params.avatar || '',
        openid: params.openid,
        unionid: params.unionid || '',
        status: 1,
      },
    })
    return this.formatUser(user)
  }

  async updateUser(id: number, fields: {
    phone?: string
    nickname?: string
    avatar?: string
    openid?: string
    unionid?: string
  }): Promise<UserProfileRecord | null> {
    const data: Record<string, string> = {}
    if (fields.phone !== undefined) data.phone = fields.phone
    if (fields.nickname !== undefined) data.nickname = fields.nickname
    if (fields.avatar !== undefined) data.avatarUrl = fields.avatar
    if (fields.openid !== undefined) data.openid = fields.openid
    if (fields.unionid !== undefined) data.unionid = fields.unionid

    try {
      const user = await this.prisma.user.update({
        where: { id: BigInt(id) },
        data,
      })
      return this.formatUser(user)
    }
    catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 'P2025') {
        return null
      }
      throw error
    }
  }

  private formatUser(user: User): UserProfileRecord {
    return {
      id: Number(user.id),
      phone: user.phone || '',
      nickname: user.nickname || '',
      avatar: user.avatarUrl || '',
      status: user.status,
      role: 'user',
      openid: user.openid || '',
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    }
  }
}
