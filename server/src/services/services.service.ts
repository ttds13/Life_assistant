import { Inject, Injectable } from '@nestjs/common'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { serialize } from '../common/serialize/serialize'
import { SERVICE_STATUS_ONLINE } from './constants/service-status'
import type { QueryServicesDto } from './dto/query-services.dto'
import { ServicesRepository } from './services.repository'
import { ObjectStorageService } from '../storage/storage.service'

@Injectable()
export class ServicesService {
  constructor(
    @Inject(ServicesRepository) private readonly repository: ServicesRepository,
    @Inject(ObjectStorageService) private readonly storage: ObjectStorageService,
  ) {}

  async listCategories(status?: number) {
    const categories = await this.repository.findCategories({ status })
    return categories.map(item => ({
      id: Number(item.id),
      name: item.name,
      icon: item.icon || '',
      sortOrder: item.sortOrder,
      status: item.status,
      serviceCount: item._count.services,
    }))
  }

  async listHomeBanners() {
    const banners = await this.repository.findHomeBanners()
    return banners.map(banner => this.formatHomeBanner(banner))
  }

  async listServices(query: QueryServicesDto) {
    const result = await this.repository.findServices(query)
    return {
      ...result,
      items: result.items.map(item => this.formatService(item)),
    }
  }

  async getServiceDetail(identifier: string | number) {
    const normalized = String(identifier)
    const service = this.isPositiveIntegerText(normalized)
      ? await this.repository.findServiceById(Number(normalized))
      : await this.repository.findServiceByCode(normalized)
    if (!service || service.status !== SERVICE_STATUS_ONLINE || service.deletedAt) {
      throw new BusinessException(ErrorCode.SERVICE_NOT_FOUND, '服务不存在', 404)
    }
    return this.formatService(service)
  }

  private isPositiveIntegerText(value: string) {
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed > 0 && String(parsed) === value
  }

  private formatService(service: Record<string, unknown>) {
    const serialized = serialize(service) as Record<string, unknown>
    const coverImageOssUrl = typeof serialized.coverImage === 'string' ? serialized.coverImage : ''
    const coverImage = this.storage.signNullableUrl(coverImageOssUrl) || coverImageOssUrl
    const images = Array.isArray(serialized.images)
      ? serialized.images.map((image) => {
          if (!image || typeof image !== 'object') return image
          const record = image as Record<string, unknown>
          const urlOss = typeof record.url === 'string' ? record.url : ''
          const signed = this.storage.signNullableUrl(urlOss) || urlOss
          return {
            ...record,
            urlOss,
            url: signed,
            displayUrl: signed,
          }
        })
      : serialized.images
    return {
      ...serialized,
      description: typeof serialized.description === 'string' ? serialized.description : '',
      coverImage,
      coverImageOssUrl,
      coverImageDisplayUrl: coverImage,
      images,
      priceUnit: typeof serialized.priceUnit === 'string' ? serialized.priceUnit : '',
    }
  }

  private formatHomeBanner(banner: Record<string, unknown>) {
    const serialized = serialize(banner) as Record<string, unknown>
    const imageOssUrl = typeof serialized.imageUrl === 'string' ? serialized.imageUrl : ''
    const imageUrl = this.storage.signNullableUrl(imageOssUrl) || imageOssUrl
    return {
      ...serialized,
      subtitle: typeof serialized.subtitle === 'string' ? serialized.subtitle : '',
      linkType: typeof serialized.linkType === 'string' ? serialized.linkType : 'none',
      linkValue: typeof serialized.linkValue === 'string' ? serialized.linkValue : '',
      imageUrl,
      imageOssUrl,
      imageDisplayUrl: imageUrl,
    }
  }
}
