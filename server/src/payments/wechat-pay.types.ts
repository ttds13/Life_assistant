export interface WechatPayConfigValue {
  appid: string
  mchId: string
  serialNo: string
  apiV3Key: string
  privateKey: string
  notifyUrl: string
  refundNotifyUrl?: string
  transferNotifyUrl?: string
  transferSceneId?: string
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

export interface WechatRefundRequest {
  paymentNo: string
  refundNo: string
  reason?: string
  amountFen: number
  totalFen: number
  notifyUrl?: string
}

export interface WechatRefundResponse {
  refund_id?: string
  out_refund_no: string
  transaction_id?: string
  out_trade_no?: string
  channel?: string
  user_received_account?: string
  success_time?: string
  create_time?: string
  status?: 'SUCCESS' | 'CLOSED' | 'PROCESSING' | 'ABNORMAL' | string
  amount?: {
    total?: number
    refund?: number
    payer_total?: number
    payer_refund?: number
    settlement_refund?: number
    settlement_total?: number
    discount_refund?: number
    currency?: string
  }
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

export interface WechatRefundNotify {
  mchid: string
  out_trade_no?: string
  transaction_id?: string
  out_refund_no: string
  refund_id?: string
  refund_status: 'SUCCESS' | 'CLOSED' | 'PROCESSING' | 'ABNORMAL' | string
  success_time?: string
  amount?: {
    total?: number
    refund?: number
    payer_total?: number
    payer_refund?: number
  }
}

export interface WechatNotifyResult {
  body: WechatNotifyBody
  transaction: WechatTransactionNotify
}

export interface WechatRefundNotifyResult {
  body: WechatNotifyBody
  refund: WechatRefundNotify
}

export interface WechatTransferRequest {
  outBillNo: string
  openid: string
  amountFen: number
  remark: string
  transferSceneId?: string
  notifyUrl?: string
  userNameEncrypted?: string
  sceneReportInfos?: Array<{
    info_type: string
    info_content: string
  }>
}

export interface WechatTransferResponse {
  out_bill_no: string
  transfer_bill_no?: string
  create_time?: string
  state?: string
  package_info?: string
}

export interface WechatTransferQueryResponse {
  appid?: string
  mchid?: string
  out_bill_no: string
  transfer_bill_no?: string
  state?: string
  transfer_amount?: number
  transfer_remark?: string
  fail_reason?: string
  package_info?: string
  openid?: string
  create_time?: string
  update_time?: string
}

export interface WechatTransferCancelResponse {
  appid?: string
  mchid?: string
  out_bill_no: string
  transfer_bill_no?: string
  state?: string
  update_time?: string
}

export interface WechatTransferNotify {
  appid?: string
  mchid?: string
  out_bill_no: string
  transfer_bill_no?: string
  state?: string
  transfer_amount?: number
  fail_reason?: string
  package_info?: string
  openid?: string
  success_time?: string
  update_time?: string
}

export interface WechatTransferNotifyResult {
  body: WechatNotifyBody
  transfer: WechatTransferNotify
}
