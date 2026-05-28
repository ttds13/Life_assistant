import { Controller, Get, Inject, Param, Query } from '@nestjs/common'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { QueryServicesDto } from './dto/query-services.dto'
import { ServicesService } from './services.service'

@Controller()
export class ServicesController {
  constructor(@Inject(ServicesService) private readonly servicesService: ServicesService) {}

  @Get('service-categories')
  listCategories(@Query('status') status?: string) {
    const parsedStatus = this.parseOptionalInt(status, 'status')
    return this.servicesService.listCategories(parsedStatus)
  }

  @Get('services')
  listServices(@Query() query: QueryServicesDto) {
    return this.servicesService.listServices({
      ...query,
      categoryId: this.normalizeOptionalInt(query.categoryId, 'categoryId'),
      status: this.normalizeOptionalInt(query.status, 'status'),
      page: this.normalizePositiveInt(query.page, 1, 'page'),
      pageSize: this.normalizePositiveInt(query.pageSize, 20, 'pageSize', 100),
    })
  }

  @Get('services/:id')
  getServiceDetail(@Param('id') idText: string) {
    const id = Number(idText)
    if (!Number.isInteger(id) || id < 1) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'id 必须是正整数', 400)
    }
    return this.servicesService.getServiceDetail(id)
  }

  private parseOptionalInt(value: string | undefined, field: string): number | undefined {
    if (value === undefined || value === null || value === '') return undefined
    const parsed = Number(value)
    if (!Number.isInteger(parsed)) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, `${field} 必须是整数`, 400)
    }
    return parsed
  }

  private normalizeOptionalInt(value: unknown, field: string): number | undefined {
    if (value === undefined || value === null || value === '') return undefined
    const parsed = Number(value)
    if (!Number.isInteger(parsed)) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, `${field} 必须是整数`, 400)
    }
    return parsed
  }

  private normalizePositiveInt(value: unknown, fallback: number, field: string, max?: number): number {
    if (value === undefined || value === null || value === '') return fallback
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, `${field} 必须是正整数`, 400)
    }
    if (max !== undefined && parsed > max) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, `${field} 不能超过 ${max}`, 400)
    }
    return parsed
  }
}
