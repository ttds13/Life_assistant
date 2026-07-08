export function requestMerchantTransfer(packageInfo: string) {
  if (!packageInfo) {
    return Promise.reject(new Error('提现确认参数缺失，请返回后刷新提现详情或联系客服'))
  }

  // #ifdef MP-WEIXIN
  return new Promise<void>((resolve, reject) => {
    const requestTransfer = (wx as any).requestMerchantTransfer
    if (typeof requestTransfer !== 'function') {
      reject(new Error('当前微信版本不支持确认收款，请升级微信或联系客服处理'))
      return
    }
    requestTransfer({
      package_info: packageInfo,
      success: () => resolve(),
      fail: (error: unknown) => reject(new Error(getMerchantTransferErrorMessage(error))),
    })
  })
  // #endif

  // #ifndef MP-WEIXIN
  return Promise.reject(new Error('确认收款只能在微信小程序内完成，请使用微信打开'))
  // #endif
}

function getMerchantTransferErrorMessage(error: unknown) {
  const message = typeof error === 'object' && error && 'errMsg' in error
    ? String((error as { errMsg?: string }).errMsg || '')
    : String(error || '')

  if (/cancel/i.test(message)) return '已取消确认收款'
  if (/auth|permission|deny/i.test(message)) return '微信确认收款授权失败，请重新操作'
  if (/fail|error/i.test(message)) return '微信确认收款未完成，请稍后重试'
  return message || '确认收款未完成，请稍后重试'
}
