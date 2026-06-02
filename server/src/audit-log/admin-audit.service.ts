import { Inject, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

export interface AdminAuditParams {
  adminId: number | bigint
  action: string
  module: string
  targetType?: string
  targetId?: number | bigint | null
  detail?: Record<string, unknown>
  requestId?: string
  ip?: string
}

@Injectable()
export class AdminAuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  write(params: AdminAuditParams) {
    return this.writeWithClient(this.prisma, params)
  }

  writeWithClient(tx: Prisma.TransactionClient, params: AdminAuditParams) {
    return tx.auditLog.create({
      data: {
        operatorType: 'admin',
        operatorId: BigInt(params.adminId),
        action: params.action,
        module: params.module,
        targetType: params.targetType,
        targetId: params.targetId === undefined || params.targetId === null
          ? undefined
          : BigInt(params.targetId),
        detail: params.detail ? params.detail as Prisma.InputJsonObject : undefined,
        ip: params.ip,
        requestId: params.requestId,
      },
    })
  }
}
