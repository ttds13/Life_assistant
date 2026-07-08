import fs from 'node:fs'
import path from 'node:path'
import { Inject, Injectable, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import type { WechatPayConfigValue } from './wechat-pay.types'

@Injectable()
export class WechatPayConfig implements OnModuleInit {
  private cached?: WechatPayConfigValue

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  onModuleInit() {
    if (
      this.config.get<string>('PAYMENT_PROVIDER', 'wechat') !== 'wechat'
      && this.config.get<string>('REFUND_PROVIDER', '') !== 'wechat'
      && this.config.get<string>('WITHDRAW_PROVIDER', 'mock') !== 'wechat'
    ) {
      return
    }
    this.getWechatConfig()
  }

  getWechatConfig(): WechatPayConfigValue {
    if (this.cached) return this.cached

    const appid = this.first('WECHAT_PAY_APPID', 'WECHAT_APPID')
    const mchId = this.required('WECHAT_PAY_MCH_ID')
    const serialNo = this.required('WECHAT_PAY_SERIAL_NO')
    const apiV3Key = this.required('WECHAT_PAY_API_V3_KEY')
    const notifyUrl = this.resolveNotifyUrl()
    const refundNotifyUrl = this.resolveRefundNotifyUrl()
    const transferNotifyUrl = this.resolveTransferNotifyUrl()
    const transferSceneId = this.config.get<string>('WECHAT_TRANSFER_SCENE_ID', '').trim() || undefined
    const privateKey = this.resolvePrivateKey()

    if (!notifyUrl.startsWith('https://')) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'WECHAT_PAY_NOTIFY_URL must be https', 500)
    }
    if (apiV3Key.length !== 32) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'WECHAT_PAY_API_V3_KEY must be 32 characters', 500)
    }

    this.cached = {
      appid,
      mchId,
      serialNo,
      apiV3Key,
      privateKey,
      notifyUrl,
      refundNotifyUrl,
      transferNotifyUrl,
      transferSceneId,
    }
    return this.cached
  }

  getWechatPayPublicKey() {
    const inline = this.config.get<string>('WECHAT_PAY_PLATFORM_PUBLIC_KEY', '').trim()
    if (inline) return inline.replace(/\\n/g, '\n')

    const keyPath = this.config.get<string>('WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH', '').trim()
    if (!keyPath) return ''

    const absolute = path.isAbsolute(keyPath) ? keyPath : path.join(process.cwd(), keyPath)
    if (!fs.existsSync(absolute)) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, `wechat pay platform public key not found: ${keyPath}`, 500)
    }
    return fs.readFileSync(absolute, 'utf8')
  }

  private resolveNotifyUrl() {
    const explicit = this.config.get<string>('WECHAT_PAY_NOTIFY_URL', '').trim()
    if (explicit) return explicit

    const publicBaseUrl = this.config.get<string>('PUBLIC_BASE_URL', '').trim().replace(/\/$/, '')
    const apiPrefix = this.config.get<string>('API_PREFIX', '/api').trim().replace(/^\/?/, '/').replace(/\/$/, '')
    if (!publicBaseUrl) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'PUBLIC_BASE_URL or WECHAT_PAY_NOTIFY_URL is required', 500)
    }
    return `${publicBaseUrl}${apiPrefix}/payments/wechat/notify`
  }

  private resolveRefundNotifyUrl() {
    const explicit = this.config.get<string>('WECHAT_PAY_REFUND_NOTIFY_URL', '').trim()
    if (explicit) return explicit

    const publicBaseUrl = this.config.get<string>('PUBLIC_BASE_URL', '').trim().replace(/\/$/, '')
    const apiPrefix = this.config.get<string>('API_PREFIX', '/api').trim().replace(/^\/?/, '/').replace(/\/$/, '')
    if (!publicBaseUrl) return undefined
    return `${publicBaseUrl}${apiPrefix}/payments/wechat/refund-notify`
  }

  private resolveTransferNotifyUrl() {
    const explicit = this.config.get<string>('WECHAT_TRANSFER_NOTIFY_URL', '').trim()
    if (explicit) return explicit

    const publicBaseUrl = this.config.get<string>('PUBLIC_BASE_URL', '').trim().replace(/\/$/, '')
    const apiPrefix = this.config.get<string>('API_PREFIX', '/api').trim().replace(/^\/?/, '/').replace(/\/$/, '')
    if (!publicBaseUrl) return undefined
    return `${publicBaseUrl}${apiPrefix}/payments/wechat/transfer-notify`
  }

  private resolvePrivateKey() {
    const inline = this.config.get<string>('WECHAT_PAY_PRIVATE_KEY', '').trim()
    if (inline) return inline.replace(/\\n/g, '\n')

    const keyPath = this.config.get<string>('WECHAT_PAY_PRIVATE_KEY_PATH', '').trim()
    if (!keyPath) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, 'WECHAT_PAY_PRIVATE_KEY_PATH or WECHAT_PAY_PRIVATE_KEY is required', 500)
    }

    const absolute = path.isAbsolute(keyPath) ? keyPath : path.join(process.cwd(), keyPath)
    if (!fs.existsSync(absolute)) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, `wechat pay private key not found: ${keyPath}`, 500)
    }
    return fs.readFileSync(absolute, 'utf8')
  }

  private first(...keys: string[]) {
    for (const key of keys) {
      const value = this.config.get<string>(key, '').trim()
      if (value) return value
    }
    throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, `${keys.join(' or ')} is required`, 500)
  }

  private required(key: string) {
    const value = this.config.get<string>(key, '').trim()
    if (!value) {
      throw new BusinessException(ErrorCode.COMMON_BAD_REQUEST, `${key} is required`, 500)
    }
    return value
  }
}
