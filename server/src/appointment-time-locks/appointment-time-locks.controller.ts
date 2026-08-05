import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common'
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard'
import { RequireAdminPermissions } from '../admin-auth/admin-permission.decorator'
import { ADMIN_PERMISSION } from '../admin-auth/admin-permissions'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { getRequestId, RequestWithContext } from '../common/utils/request-context'
import { AppointmentTimeLocksService } from './appointment-time-locks.service'
import {
  AdminAppointmentTimeLockQueryDto,
  CreateAppointmentTimeLockDto,
  UpdateAppointmentTimeLockDto,
} from './dto/appointment-time-lock.dto'

@Controller('appointments')
export class AppointmentSlotsController {
  constructor(@Inject(AppointmentTimeLocksService) private readonly service: AppointmentTimeLocksService) {}

  @Get('slots')
  listSlots(@Query('date') date: string) {
    return this.service.listAvailableSlots(date)
  }
}

@Controller('admin/appointment-time-locks')
@UseGuards(AdminAuthGuard)
export class AdminAppointmentTimeLocksController {
  constructor(@Inject(AppointmentTimeLocksService) private readonly service: AppointmentTimeLocksService) {}

  @Get()
  @RequireAdminPermissions(ADMIN_PERMISSION.APPOINTMENT_LOCK_LIST)
  list(@Query() query: AdminAppointmentTimeLockQueryDto) {
    return this.service.listAdminLocks(query)
  }

  @Post()
  @RequireAdminPermissions(ADMIN_PERMISSION.APPOINTMENT_LOCK_CREATE)
  @HttpCode(200)
  create(@Req() request: RequestWithContext, @Body() dto: CreateAppointmentTimeLockDto) {
    return this.service.createAdminLocks(dto, this.context(request))
  }

  @Put(':id')
  @RequireAdminPermissions(ADMIN_PERMISSION.APPOINTMENT_LOCK_UPDATE)
  @HttpCode(200)
  update(@Req() request: RequestWithContext, @Param('id') idText: string, @Body() dto: UpdateAppointmentTimeLockDto) {
    return this.service.updateAdminLock(this.parseId(idText), dto, this.context(request))
  }

  @Delete(':id')
  @RequireAdminPermissions(ADMIN_PERMISSION.APPOINTMENT_LOCK_DELETE)
  @HttpCode(200)
  remove(@Req() request: RequestWithContext, @Param('id') idText: string) {
    return this.service.deleteAdminLock(this.parseId(idText), this.context(request))
  }

  private parseId(value: string) {
    const id = Number(value)
    if (!Number.isInteger(id) || id < 1) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'invalid appointment time lock id', 400)
    }
    return id
  }

  private context(request: RequestWithContext) {
    return {
      adminId: request.user!.adminId || request.user!.userId,
      requestId: getRequestId(request),
      ip: request.ip,
    }
  }
}
