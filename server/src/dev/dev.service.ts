import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { seedServiceData } from '../seed/seed-service-data'

@Injectable()
export class DevService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  seed(options: { reset?: boolean } = {}) {
    return seedServiceData(this.prisma, {
      reset: options.reset,
      allowReset: process.env.SEED_ALLOW_SERVICE_RESET === 'true',
    })
  }
}
