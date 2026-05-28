import { Controller, Get, Inject } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Controller('health')
export class HealthController {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  @Get()
  health() {
    return {
      status: 'ok',
      service: 'life-assistant-server',
      env: this.config.get<string>('NODE_ENV', 'development'),
      apiPrefix: this.config.get<string>('API_PREFIX', '/api'),
      publicBaseUrl: this.config.get<string>('PUBLIC_BASE_URL', 'http://localhost:3100'),
    }
  }
}
