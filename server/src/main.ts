import 'reflect-metadata'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Reflector } from '@nestjs/core'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module'
import { GlobalExceptionFilter } from './common/filters/global-exception.filter'
import { RequestLoggerInterceptor } from './common/interceptors/request-logger.interceptor'
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor'
import { AppLoggerService } from './common/logger/app-logger.service'

export async function createConfiguredApp() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  const config = app.get(ConfigService)
  const logger = app.get(AppLoggerService)
  const reflector = app.get(Reflector)

  app.useLogger(logger)

  const apiPrefix = config.get<string>('API_PREFIX', '/api').replace(/^\/?/, '').replace(/\/$/, '')
  app.setGlobalPrefix(apiPrefix)

  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN', '*'),
    methods: 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Authorization, X-Request-Id, X-Request-Source, X-Client-Version, X-Admin-Id, X-Staff-Id',
    exposedHeaders: 'X-Request-Id',
  })

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidUnknownValues: false,
  }))
  app.useGlobalFilters(new GlobalExceptionFilter())
  app.useGlobalInterceptors(
    new RequestLoggerInterceptor(logger),
    new ResponseTransformInterceptor(reflector),
  )

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Life Assistant Server')
    .setDescription('NestJS backend for Life Assistant')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build()
  const document = SwaggerModule.createDocument(app, swaggerConfig)
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document)

  return app
}

async function bootstrap() {
  const app = await createConfiguredApp()
  const config = app.get(ConfigService)
  const logger = app.get(AppLoggerService)

  const host = config.get<string>('HOST', '127.0.0.1')
  const port = Number(config.get<string | number>('PORT', 3100))
  const apiPrefix = config.get<string>('API_PREFIX', '/api')
  await app.listen(port, host)

  logger.log(`server_started ${host}:${port}/${apiPrefix}`)
}

if (require.main === module) {
  void bootstrap()
}
