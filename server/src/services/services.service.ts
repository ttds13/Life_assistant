import { Inject, Injectable } from '@nestjs/common'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { serialize } from '../common/serialize/serialize'
import { SERVICE_STATUS_ONLINE } from './constants/service-status'
import type { QueryServicesDto } from './dto/query-services.dto'
import { ServicesRepository } from './services.repository'

@Injectable()
export class ServicesService {
  constructor(@Inject(ServicesRepository) private readonly repository: ServicesRepository) {}

  async listCategories(status?: number) {
    const categories = await this.repository.findCategories({ status })
    return categories.map(item => ({
      id: Number(item.id),
      name: item.name,
      icon: item.icon || '',
      sortOrder: item.sortOrder,
      status: item.status,
    }))
  }

  async listServices(query: QueryServicesDto) {
    const result = await this.repository.findServices(query)
    return {
      ...result,
      items: result.items.map(item => this.formatService(item)),
    }
  }

  async getServiceDetail(id: number) {
    const service = await this.repository.findServiceById(id)
    if (!service || service.status !== SERVICE_STATUS_ONLINE || service.deletedAt) {
      throw new BusinessException(ErrorCode.SERVICE_NOT_FOUND, '服务不存在', 404)
    }
    return this.formatService(service)
  }

  private formatService(service: Record<string, unknown>) {
    const serialized = serialize(service) as Record<string, unknown>
    return {
      ...serialized,
      description: typeof serialized.description === 'string' ? serialized.description : '',
      coverImage: typeof serialized.coverImage === 'string' ? serialized.coverImage : '',
      priceUnit: typeof serialized.priceUnit === 'string' ? serialized.priceUnit : '',
    }
  }
}
