<script setup lang="ts">
import { onHide, onLaunch, onShow } from '@dcloudio/uni-app'
import { mockLogin } from '@/api/auth'
import { navigateToInterceptor } from '@/router/interceptor'
import { useTokenStore } from '@/store/token'
import { useUserStore } from '@/store/user'

const tokenStore = useTokenStore()
const userStore = useUserStore()

async function ensureLocalDebugLogin() {
  if (import.meta.env.VITE_LOCAL_DEBUG_AUTO_LOGIN !== 'true')
    return
  if (tokenStore.hasLogin)
    return

  try {
    const result = await mockLogin({ phone: import.meta.env.VITE_LOCAL_DEBUG_LOGIN_PHONE || undefined })
    tokenStore.setTokenInfo(result)
    userStore.setFromProfile(result.user)
    console.log('local_debug_auto_login_success', result.user.nickname)
  }
  catch (error) {
    console.warn('local_debug_auto_login_failed', error)
  }
}

onLaunch((options) => {
  console.log('App.vue onLaunch', options)
  void ensureLocalDebugLogin()
})
onShow((options) => {
  console.log('App.vue onShow', options)
  // 处理直接进入页面路由的情况：如h5直接输入路由、微信小程序分享后进入等
  // https://github.com/unibest-tech/unibest/issues/192
  if (options?.path) {
    navigateToInterceptor.invoke({ url: `/${options.path}`, query: options.query })
  }
  else {
    navigateToInterceptor.invoke({ url: '/' })
  }
})
onHide(() => {
  console.log('App Hide')
})
</script>

<style lang="scss">

</style>
