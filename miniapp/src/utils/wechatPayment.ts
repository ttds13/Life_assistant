import type { PayOrderResult, WechatPaymentParams } from '@/api/types/orders'

export function getWechatPaymentParams(payment: PayOrderResult): WechatPaymentParams {
  const params = payment.paymentParams
  if (!params || payment.provider !== 'wechat') {
    throw new Error('微信支付参数缺失')
  }
  const required = ['timeStamp', 'nonceStr', 'package', 'signType', 'paySign'] as const
  for (const key of required) {
    if (!params[key]) {
      throw new Error(`微信支付参数缺失: ${key}`)
    }
  }
  return {
    timeStamp: params.timeStamp,
    nonceStr: params.nonceStr,
    package: params.package,
    signType: params.signType,
    paySign: params.paySign,
  }
}

export function requestWechatPayment(params: WechatPaymentParams) {
  return new Promise<void>((resolve, reject) => {
    const options = {
      ...params,
      success: () => resolve(),
      fail: (error) => reject(error),
    } as unknown as UniApp.RequestPaymentOptions
    uni.requestPayment(options)
  })
}

export async function requestOrderPayment(_orderId: number, payment: PayOrderResult) {
  const params = getWechatPaymentParams(payment)
  await requestWechatPayment(params)
}
