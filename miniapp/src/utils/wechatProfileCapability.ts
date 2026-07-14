const MIN_WECHAT_PROFILE_SDK = '2.21.2'

function compareVersion(current: string, required: string) {
  const currentParts = current.split('.').map(part => Number(part) || 0)
  const requiredParts = required.split('.').map(part => Number(part) || 0)
  const length = Math.max(currentParts.length, requiredParts.length)
  for (let index = 0; index < length; index += 1) {
    const currentValue = currentParts[index] || 0
    const requiredValue = requiredParts[index] || 0
    if (currentValue > requiredValue)
      return 1
    if (currentValue < requiredValue)
      return -1
  }
  return 0
}

export function getWechatProfileCapabilityWarning() {
  // #ifdef MP-WEIXIN
  const sdkVersion = uni.getSystemInfoSync().SDKVersion || ''
  if (sdkVersion && compareVersion(sdkVersion, MIN_WECHAT_PROFILE_SDK) < 0) {
    return `当前微信基础库 ${sdkVersion} 不支持选择微信头像/昵称，请升级微信或在开发者工具中切换基础库到 ${MIN_WECHAT_PROFILE_SDK} 以上。`
  }
  // #endif

  return ''
}

export function showWechatProfileCapabilityWarning() {
  const warning = getWechatProfileCapabilityWarning()
  if (!warning)
    return false

  uni.showModal({
    title: '当前环境不支持',
    content: warning,
    showCancel: false,
    confirmText: '知道了',
  })
  return true
}
