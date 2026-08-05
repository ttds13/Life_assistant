import { Inject, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { AdminAuditService } from '../audit-log/admin-audit.service'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { PrismaService } from '../prisma/prisma.service'
import { appointmentSlotStartMinutes, BASE_APPOINTMENT_TIME_SLOTS, isAppointmentTimeSlot } from './appointment-slots'
import type {
  AdminAppointmentTimeLockQueryDto,
  CreateAppointmentTimeLockDto,
  UpdateAppointmentTimeLockDto,
} from './dto/appointment-time-lock.dto'

type AppointmentLockClient = PrismaService | Prisma.TransactionClient

interface AdminContext {
  adminId: number
  requestId?: string
  ip?: string
}

@Injectable()
export class AppointmentTimeLocksService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AdminAuditService) private readonly audit: AdminAuditService,
  ) {}

  async listAvailableSlots(dateText: string, now = new Date()) {
    const lockDate = this.parseDate(dateText)
    const locks = await this.prisma.appointmentTimeLock.findMany({
      where: { lockDate, status: 'active' },
      select: { timeSlot: true },
    })
    const lockedSlots = new Set(locks.map(item => item.timeSlot))
    const current = this.shanghaiDateTime(now)
    const isToday = current.date === dateText

    return {
      date: dateText,
      items: BASE_APPOINTMENT_TIME_SLOTS.map(timeSlot => {
        const past = isToday && appointmentSlotStartMinutes(timeSlot) <= current.minutes
        const locked = lockedSlots.has(timeSlot)
        return {
          timeSlot,
          available: !past && !locked,
          reason: past
            ? '该时段已过'
            : locked
              ? '该时段暂不可预约'
              : undefined,
        }
      }),
    }
  }

  async assertSlotAvailable(dateText: string, timeSlot: string, client: AppointmentLockClient = this.prisma, now = new Date()) {
    this.parseDate(dateText)
    if (!isAppointmentTimeSlot(timeSlot)) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, '预约时段无效，请重新选择时间', 400)
    }
    const current = this.shanghaiDateTime(now)
    if (current.date === dateText && appointmentSlotStartMinutes(timeSlot) <= current.minutes) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, '该时段已过，请重新选择时间', 409)
    }

    const lock = await client.appointmentTimeLock.findFirst({
      where: { lockDate: this.parseDate(dateText), timeSlot, status: 'active' },
      select: { id: true },
    })
    if (lock) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, '该时段暂不可预约，请重新选择时间', 409)
    }
  }

  async listAdminLocks(query: AdminAppointmentTimeLockQueryDto) {
    const where: Prisma.AppointmentTimeLockWhereInput = {}
    const dateStart = query.dateStart || this.shanghaiDateTime(new Date()).date
    if (dateStart || query.dateEnd) {
      where.lockDate = {
        ...(dateStart ? { gte: this.parseDate(dateStart) } : {}),
        ...(query.dateEnd ? { lte: this.parseDate(query.dateEnd) } : {}),
      }
    }
    if (query.status) where.status = query.status
    const items = await this.prisma.appointmentTimeLock.findMany({
      where,
      orderBy: [{ lockDate: 'asc' }, { timeSlot: 'asc' }, { id: 'asc' }],
    })
    return { items: items.map(item => this.present(item)) }
  }

  async createAdminLocks(dto: CreateAppointmentTimeLockDto, context: AdminContext) {
    const lockDate = this.parseDate(dto.lockDate)
    const slots = Array.from(new Set([...(dto.timeSlots || []), ...(dto.timeSlot ? [dto.timeSlot] : [])]))
    if (!slots.length) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'at least one appointment time slot is required', 400)
    }
    for (const slot of slots) {
      if (!isAppointmentTimeSlot(slot)) {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid appointment time slot', 400)
      }
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const rows = []
        for (const timeSlot of slots) {
          const row = await tx.appointmentTimeLock.create({
            data: {
              lockDate,
              timeSlot,
              reason: dto.reason || null,
              status: 'active',
              createdBy: BigInt(context.adminId),
            },
          })
          await this.audit.writeWithClient(tx, {
            adminId: context.adminId,
            action: 'appointment-time-lock:create',
            module: 'appointment',
            targetType: 'appointment_time_lock',
            targetId: row.id,
            requestId: context.requestId,
            ip: context.ip,
            detail: { lockDate: dto.lockDate, timeSlot, reason: dto.reason || '' },
          })
          rows.push(row)
        }
        return rows
      })
      return { items: created.map(item => this.present(item)) }
    }
    catch (error) {
      if (this.isUniqueConflict(error)) {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, '该日期和时段已存在锁定记录', 409)
      }
      throw error
    }
  }

  async updateAdminLock(id: number, dto: UpdateAppointmentTimeLockDto, context: AdminContext) {
    const current = await this.prisma.appointmentTimeLock.findUnique({ where: { id: BigInt(id) } })
    if (!current) throw this.notFound()
    const lockDate = dto.lockDate ? this.parseDate(dto.lockDate) : current.lockDate
    const timeSlot = dto.timeSlot || current.timeSlot
    if (!isAppointmentTimeSlot(timeSlot)) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid appointment time slot', 400)
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const row = await tx.appointmentTimeLock.update({
          where: { id: current.id },
          data: {
            lockDate,
            timeSlot,
            reason: dto.reason === undefined ? current.reason : dto.reason || null,
            status: dto.status || current.status,
          },
        })
        await this.audit.writeWithClient(tx, {
          adminId: context.adminId,
          action: 'appointment-time-lock:update',
          module: 'appointment',
          targetType: 'appointment_time_lock',
          targetId: row.id,
          requestId: context.requestId,
          ip: context.ip,
          detail: {
            before: this.present(current),
            after: this.present(row),
          },
        })
        return row
      })
      return this.present(updated)
    }
    catch (error) {
      if (this.isUniqueConflict(error)) {
        throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, '该日期和时段已存在锁定记录', 409)
      }
      throw error
    }
  }

  async deleteAdminLock(id: number, context: AdminContext) {
    const current = await this.prisma.appointmentTimeLock.findUnique({ where: { id: BigInt(id) } })
    if (!current) throw this.notFound()
    await this.prisma.$transaction(async (tx) => {
      await tx.appointmentTimeLock.delete({ where: { id: current.id } })
      await this.audit.writeWithClient(tx, {
        adminId: context.adminId,
        action: 'appointment-time-lock:delete',
        module: 'appointment',
        targetType: 'appointment_time_lock',
        targetId: current.id,
        requestId: context.requestId,
        ip: context.ip,
        detail: this.present(current),
      })
    })
    return { id, deleted: true }
  }

  private present(item: {
    id: bigint
    lockDate: Date
    timeSlot: string
    reason: string | null
    status: string
    createdBy: bigint
    createdAt: Date
    updatedAt: Date
  }) {
    return {
      id: String(item.id),
      lockDate: item.lockDate.toISOString().slice(0, 10),
      timeSlot: item.timeSlot,
      reason: item.reason || '',
      status: item.status,
      createdBy: Number(item.createdBy),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    }
  }

  private parseDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid appointment date', 400)
    }
    const date = new Date(`${value}T00:00:00.000Z`)
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid appointment date', 400)
    }
    return date
  }

  private shanghaiDateTime(now: Date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now)
    const value = (type: string) => parts.find(item => item.type === type)?.value || '0'
    return {
      date: `${value('year')}-${value('month')}-${value('day')}`,
      minutes: Number(value('hour')) * 60 + Number(value('minute')),
    }
  }

  private isUniqueConflict(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  }

  private notFound() {
    return new BusinessException(ErrorCode.COMMON_NOT_FOUND, 'appointment time lock not found', 404)
  }
}
