/**
 * by 菲鸽 on 2025-08-19
 * 路由拦截，通常也是登录拦截
 * 黑、白名单的配置，请看 config.ts 文件， EXCLUDE_LOGIN_PATH_LIST
 */
import { isPageTabbar, tabbarStore } from '@/tabbar/store'
import { getLastPage, parseUrlToObj } from '@/utils/index'
import { isOrderListFilter, saveOrderListFilter } from '@/utils/orderListFilter'

export const FG_LOG_ENABLE = false

interface RouteInvokeOptions {
  url: string
  query?: Record<string, string>
  method?: 'navigateTo' | 'redirectTo' | 'reLaunch' | 'switchTab' | 'appShow'
}

function handleRouteInvoke({ url, query, method = 'appShow' }: RouteInvokeOptions) {
    if (url === undefined) {
      return
    }
    let { path, query: _query } = parseUrlToObj(url)

    FG_LOG_ENABLE && console.log('\n\n路由拦截器:-------------------------------------')
    FG_LOG_ENABLE && console.log('路由拦截器 1: url->', url, ', query ->', query)
    const myQuery = { ..._query, ...query }
    // /pages/route-interceptor/index?name=feige&age=30
    FG_LOG_ENABLE && console.log('路由拦截器 2: path->', path, ', _query ->', _query)
    FG_LOG_ENABLE && console.log('路由拦截器 3: myQuery ->', myQuery)

    // 处理相对路径
    if (!path.startsWith('/')) {
      const currentPath = getLastPage()?.route || ''
      const normalizedCurrentPath = currentPath.startsWith('/') ? currentPath : `/${currentPath}`
      const baseDir = normalizedCurrentPath.substring(0, normalizedCurrentPath.lastIndexOf('/'))
      path = `${baseDir}/${path}`
    }

    // // 处理路由不存在的情况
    // if (path !== '/' && !getAllPages().some(page => page.path === path)) {
    //   console.warn('路由不存在:', path)
    //   return false // 明确表示阻止原路由继续执行
    // }

    // // 插件页面
    // if (url.startsWith('plugin://')) {
    //   FG_LOG_ENABLE && console.log('路由拦截器 4: plugin:// 路径 ==>', url)
    //   path = url
    // }

    if (path === '/pages/order/list' && typeof myQuery.status === 'string' && isOrderListFilter(myQuery.status))
      saveOrderListFilter(myQuery.status)

    const isInvalidTabbarNavigation = (method === 'navigateTo' || method === 'redirectTo') && isPageTabbar(path)
    if (isInvalidTabbarNavigation) {
      console.warn(`${method} can not open a tabbar page, use switchTab instead: ${path}`)
      return false
    }

    // 处理直接进入路由非首页时，tabbarIndex 不正确的问题
    tabbarStore.setAutoCurIdx(path)
}

export const navigateToInterceptor = {
  // 注意，这里的url是 '/' 开头的，如 '/pages/index/index'，跟 'pages.json' 里面的 path 不同
  // 增加对相对路径的处理，BY 网友 @ideal
  invoke(options: { url: string, query?: Record<string, string> }) {
    return handleRouteInvoke(options)
  },
}

export const routeInterceptor = {
  install() {
    uni.addInterceptor('navigateTo', {
      invoke(options: { url: string, query?: Record<string, string> }) {
        return handleRouteInvoke({ ...options, method: 'navigateTo' })
      },
    })
    uni.addInterceptor('reLaunch', {
      invoke(options: { url: string, query?: Record<string, string> }) {
        return handleRouteInvoke({ ...options, method: 'reLaunch' })
      },
    })
    uni.addInterceptor('redirectTo', {
      invoke(options: { url: string, query?: Record<string, string> }) {
        return handleRouteInvoke({ ...options, method: 'redirectTo' })
      },
    })
    uni.addInterceptor('switchTab', {
      invoke(options: { url: string, query?: Record<string, string> }) {
        return handleRouteInvoke({ ...options, method: 'switchTab' })
      },
    })
  },
}
