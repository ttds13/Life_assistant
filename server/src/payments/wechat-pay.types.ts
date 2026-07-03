export interface WechatPayConfigValue {
  appid: string
  mchId: string
  serialNo: string
  apiV3Key: string
  privateKey: string
  notifyUrl: string
}

export interface WechatJsapiOrderRequest {
  paymentNo: string
  description: string
  amountFen: number
  openid: string
}

export interface WechatJsapiOrderResponse {
  prepay_id: string
}

export interface WechatPaymentParams {
  timeStamp: string
  nonceStr: string
  package: string
  signType: 'RSA'
  paySign: string
}

export interface WechatNotifyHeaders {
  signature: string
  timestamp: string
  nonce: string
  serial: string
}

export interface WechatNotifyResource {
  algorithm: string
  ciphertext: string
  associated_data?: string
  nonce: string
  original_type?: string
}

export interface WechatNotifyBody {
  id?: string
  create_time?: string
  event_type?: string
  resource_type?: string
  summary?: string
  resource?: WechatNotifyResource
}

export interface WechatTransactionNotify {
  appid: string
  mchid: string
  out_trade_no: string
  transaction_id?: string
  trade_state: string
  trade_state_desc?: string
  payer?: {
    openid?: string
  }
  amount?: {
    total?: number
    payer_total?: number
    currency?: string
    payer_currency?: string
  }
  success_time?: string
}

export interface WechatNotifyResult {
  body: WechatNotifyBody
  transaction: WechatTransactionNotify
}
