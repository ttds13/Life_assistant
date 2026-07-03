import crypto from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import { BusinessException } from '../common/errors/business-exception'
import { ErrorCode } from '../common/errors/error-code'
import { WechatPayConfig } from './wechat-pay.config'
import type {
  WechatJsapiOrderRequest,
  WechatJsapiOrderResponse,
  WechatNotifyBody,
  WechatNotifyHeaders,
  WechatNotifyResult,
  WechatPaymentParams,
  WechatTransactionNotify,
} from './wechat-pay.types'

const WECHAT_PAY_API_BASE = 'https://api.mch.weixin.qq.com'

@Injectable()
export class WechatPayClient {
  constructor(@Inject(WechatPayConfig) private readonly payConfig: WechatPayConfig) {}

  async createJsapiOrder(input: WechatJsapiOrderRequest): Promise<WechatJsapiOrderResponse> {
    const config = this.payConfig.getWechatConfig()
    const body = {
      appid: config.appid,
      mchid: config.mchId,
      description: input.description.slice(0, 127),
      out_trade_no: input.paymentNo,
      notify_url: config.notifyUrl,
      amount: {
        total: input.amountFen,
        currency: 'CNY',
      },
      payer: {
        openid: input.openid,
      },
    }

    return this.requestWechat<WechatJsapiOrderResponse>('POST', '/v3/pay/transactions/jsapi', body)
  }

  buildMiniProgramPaymentParams(prepayId: string): WechatPaymentParams {
    const config = this.payConfig.getWechatConfig()
    const timeStamp = Math.floor(Date.now() / 1000).toString()
    const nonceStr = this.createNonce()
    const pkg = `prepay_id=${prepayId}`
    const message = `${config.appid}\n${timeStamp}\n${nonceStr}\n${pkg}\n`
    const paySign = this.sign(message)
    return {
      timeStamp,
      nonceStr,
      package: pkg,
      signType: 'RSA',
      paySign,
    }
  }

  parseNotify(rawBody: string, headers: WechatNotifyHeaders): WechatNotifyResult {
    this.verifyNotifySignature(rawBody, headers)

    let body: WechatNotifyBody
    try {
      body = JSON.parse(rawBody) as WechatNotifyBody
    }
    catch {
      throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, 'invalid wechat notify json', 400)
    }

    if (!body.resource) {
      throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, 'wechat notify resource missing', 400)
    }

    const transaction = this.decryptResource(body.resource) as WechatTransactionNotify
    return { body, transaction }
  }

  private async requestWechat<T>(method: 'POST' | 'GET', apiPath: string, body?: unknown): Promise<T> {
    const bodyText = body === undefined ? '' : JSON.stringify(body)
    const authorization = this.buildAuthorization(method, apiPath, bodyText)
    const response = await fetch(`${WECHAT_PAY_API_BASE}${apiPath}`, {
      method,
      headers: {
        Authorization: authorization,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'LifeAssistant/0.1.0',
      },
      body: method === 'GET' ? undefined : bodyText,
    })

    const text = await response.text()
    let data: unknown = null
    if (text) {
      try {
        data = JSON.parse(text)
      }
      catch {
        data = { raw: text }
      }
    }

    if (!response.ok) {
      const record = data && typeof data === 'object' ? data as Record<string, unknown> : {}
      const message = String(record.message || record.code || response.statusText || 'wechat pay api failed')
      throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, message, response.status)
    }

    return data as T
  }

  private buildAuthorization(method: string, apiPath: string, body: string) {
    const config = this.payConfig.getWechatConfig()
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const nonce = this.createNonce()
    const message = `${method}\n${apiPath}\n${timestamp}\n${nonce}\n${body}\n`
    const signature = this.sign(message)
    const token = [
      `mchid="${config.mchId}"`,
      `nonce_str="${nonce}"`,
      `signature="${signature}"`,
      `timestamp="${timestamp}"`,
      `serial_no="${config.serialNo}"`,
    ].join(',')
    return `WECHATPAY2-SHA256-RSA2048 ${token}`
  }

  private verifyNotifySignature(rawBody: string, headers: WechatNotifyHeaders) {
    if (!headers.signature || !headers.timestamp || !headers.nonce || !headers.serial) {
      throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, 'wechat notify signature headers missing', 400)
    }

    const publicKey = this.resolveWechatPayPublicKey()
    if (!publicKey) {
      // Keep this explicit while platform certificate/public key rotation is wired.
      throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, 'wechat pay platform public key is not configured', 500)
    }

    const message = `${headers.timestamp}\n${headers.nonce}\n${rawBody}\n`
    const verifier = crypto.createVerify('RSA-SHA256')
    verifier.update(message)
    verifier.end()
    const ok = verifier.verify(publicKey, headers.signature, 'base64')
    if (!ok) {
      throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, 'wechat notify signature invalid', 401)
    }
  }

  private resolveWechatPayPublicKey() {
    return this.payConfig.getWechatPayPublicKey()
  }

  private decryptResource(resource: {
    ciphertext: string
    associated_data?: string
    nonce: string
  }) {
    const config = this.payConfig.getWechatConfig()
    try {
      const ciphertext = Buffer.from(resource.ciphertext, 'base64')
      const authTag = ciphertext.subarray(ciphertext.length - 16)
      const data = ciphertext.subarray(0, ciphertext.length - 16)
      const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(config.apiV3Key, 'utf8'), Buffer.from(resource.nonce, 'utf8'))
      if (resource.associated_data) {
        decipher.setAAD(Buffer.from(resource.associated_data, 'utf8'))
      }
      decipher.setAuthTag(authTag)
      const decrypted = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
      return JSON.parse(decrypted) as unknown
    }
    catch {
      throw new BusinessException(ErrorCode.PAYMENT_STATUS_INVALID, 'wechat notify decrypt failed', 400)
    }
  }

  private sign(message: string) {
    const config = this.payConfig.getWechatConfig()
    const signer = crypto.createSign('RSA-SHA256')
    signer.update(message)
    signer.end()
    return signer.sign(config.privateKey, 'base64')
  }

  private createNonce() {
    return crypto.randomBytes(16).toString('hex')
  }
}
