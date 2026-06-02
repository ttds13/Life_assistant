<template>
  <div class="login-page">
    <div class="login-page__toolbar">
      <el-tooltip :content="t('login.themeToggle')" placement="bottom">
        <div class="toolbar-item">
          <ThemeSwitch />
        </div>
      </el-tooltip>
      <el-tooltip :content="t('login.languageToggle')" placement="bottom">
        <div class="toolbar-item">
          <LangSelect size="text-20px" />
        </div>
      </el-tooltip>
    </div>

    <div class="login-page__body">
      <section class="login-hero">
        <div class="login-hero__badge">
          <span class="login-hero__dot" />
          Life Assistant Admin
        </div>
        <h1 class="login-hero__title">生活助手后台管理</h1>
        <p class="login-hero__subtitle">
          面向家政服务平台的运营后台，覆盖用户、服务、订单、师傅、财务和审核流程。
        </p>
        <ul class="login-hero__features">
          <li>
            <span>✓</span>
            订单派单、履约跟踪与售后处理
          </li>
          <li>
            <span>✓</span>
            师傅认证、工作状态和收入管理
          </li>
          <li>
            <span>✓</span>
            支付退款、提现审核和操作审计
          </li>
          <li>
            <span>✓</span>
            菜单权限、角色管理和平台配置
          </li>
        </ul>
      </section>

      <section class="login-card">
        <div class="login-card__brand">
          <div class="login-card__logo-wrap">
            <el-image :src="logo" class="login-card__logo" />
          </div>
          <div class="login-card__meta">
            <div class="login-card__title-row">
              <span class="login-card__title">{{ appConfig.title }}</span>
            </div>
            <div v-if="appConfig.version" class="login-card__version-row">
              <el-text size="small" type="info">VERSION</el-text>
              <el-tag v-if="appConfig.version" size="small" effect="light" round>
                {{ `v${appConfig.version}` }}
              </el-tag>
            </div>
          </div>
        </div>

        <transition name="fade-slide" mode="out-in">
          <div key="login" class="login-card__form">
            <h3 class="login-form__title text-center">{{ t("login.login") }}</h3>
            <el-form
              ref="loginFormRef"
              :model="loginFormData"
              :rules="loginRules"
              size="large"
              :validate-on-rule-change="false"
            >
              <el-form-item prop="username">
                <el-input v-model.trim="loginFormData.username" :placeholder="t('login.username')">
                  <template #prefix>
                    <el-icon><User /></el-icon>
                  </template>
                </el-input>
              </el-form-item>

              <el-tooltip :visible="isCapsLock" :content="t('login.capsLock')" placement="right">
                <el-form-item prop="password">
                  <el-input
                    v-model.trim="loginFormData.password"
                    :placeholder="t('login.password')"
                    type="password"
                    show-password
                    @keyup="checkCapsLock"
                    @keyup.enter="handleLoginSubmit"
                  >
                    <template #prefix>
                      <el-icon><Lock /></el-icon>
                    </template>
                  </el-input>
                </el-form-item>
              </el-tooltip>

              <div class="flex-x-between w-full">
                <el-checkbox v-model="loginFormData.rememberMe">
                  {{ t("login.rememberMe") }}
                </el-checkbox>
                <el-text type="info" size="small">管理员账号由系统维护人员创建</el-text>
              </div>

              <el-form-item>
                <el-button
                  :loading="loading"
                  type="primary"
                  class="w-full"
                  @click="handleLoginSubmit"
                >
                  {{ t("login.login") }}
                </el-button>
              </el-form-item>
            </el-form>
          </div>
        </transition>

        <footer class="login-card__footer">
          <el-text size="small">Life Assistant Admin © 2026</el-text>
        </footer>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { User, Lock } from "@element-plus/icons-vue";
import type { FormInstance } from "element-plus";
import type { LoginRequest } from "@/api/auth";
import router from "@/router";
import { useUserStore } from "@/stores";
import { AuthStorage } from "@/utils/auth";
import logo from "@/assets/images/logo.png";
import { appConfig } from "@/settings";
import ThemeSwitch from "@/components/ThemeSwitch/index.vue";

const { t } = useI18n();
const userStore = useUserStore();
const route = useRoute();

const loginFormRef = ref<FormInstance>();
const loading = ref(false);
const isCapsLock = ref(false);

const rememberMe = AuthStorage.getRememberMe();
const loginFormData = ref<LoginRequest>({
  username: "",
  password: "",
  rememberMe,
});

const loginRules = computed(() => ({
  username: [{ required: true, trigger: "blur", message: t("login.message.username.required") }],
  password: [
    { required: true, trigger: "blur", message: t("login.message.password.required") },
    { min: 6, message: t("login.message.password.min"), trigger: "blur" },
  ],
}));

async function handleLoginSubmit() {
  const valid = await loginFormRef.value?.validate().then(
    () => true,
    () => false
  );
  if (!valid) return;

  loading.value = true;
  try {
    await userStore.login(loginFormData.value);
    const redirectPath = (route.query.redirect as string) || "/";
    await router.push(decodeURIComponent(redirectPath));
  } finally {
    loading.value = false;
  }
}

function checkCapsLock(event: KeyboardEvent) {
  if (event instanceof KeyboardEvent) {
    isCapsLock.value = event.getModifierState("CapsLock");
  }
}
</script>

<style lang="scss" scoped>
.login-page {
  --login-hero-text: #1a1a2e;
  --login-hero-sub: #6b7280;
  --login-card-bg: rgb(255 255 255 / 90%);
  --login-card-border: rgb(0 0 0 / 6%);

  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding: clamp(1rem, 3vw, 2rem);
  overflow: hidden;
  background: #f5f8ff;

  &::before {
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    content: "";
    background: url("@/assets/images/login/bg.svg") center/cover no-repeat;
  }
}

.dark .login-page {
  --login-hero-text: #e4e8f0;
  --login-hero-sub: #8893a8;
  --login-card-bg: rgb(22 26 36 / 90%);
  --login-card-border: rgb(255 255 255 / 7%);

  background: #0b0f19;

  &::before {
    background-image: url("@/assets/images/login/bg-dark.svg");
  }
}

.login-page__toolbar {
  position: relative;
  z-index: 1;
  display: inline-flex;
  gap: 8px;
  align-self: flex-end;
  padding: 6px 10px;
  background: var(--login-card-bg);
  border: 1px solid var(--login-card-border);
  border-radius: 999px;
  backdrop-filter: blur(8px);

  .toolbar-item {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px;
    cursor: pointer;
    border-radius: 8px;
    transition: background 0.2s;

    &:hover {
      background: var(--el-fill-color);
    }
  }

  @media (max-width: 640px) {
    position: fixed;
    top: 12px;
    right: 16px;
    z-index: 20;
  }
}

.login-page__body {
  position: relative;
  z-index: 1;
  display: grid;
  flex: 1;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: clamp(2rem, 4vw, 4rem);
  align-items: stretch;
  padding: clamp(1.5rem, 2vw, 2.5rem);
}

.login-hero {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: clamp(1rem, 2vw, 2rem);
  color: var(--login-hero-text);
  animation: heroIn 0.8s ease-out;
}

.login-hero__badge {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  width: fit-content;
  padding: 5px 12px;
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--el-color-primary);
  letter-spacing: 0.06em;
  background: var(--el-color-primary-light-9);
  border-radius: 999px;
}

.login-hero__dot {
  width: 7px;
  height: 7px;
  background: var(--el-color-primary);
  border-radius: 50%;
}

.login-hero__title {
  margin: 1.25rem 0 0.5rem;
  font-size: clamp(1.75rem, 3.5vw, 2.25rem);
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.02em;
}

.login-hero__subtitle {
  margin-bottom: 1.5rem;
  font-size: 0.95rem;
  line-height: 1.7;
  color: var(--login-hero-sub);
}

.login-hero__features {
  display: grid;
  gap: 8px;
  padding: 0;
  margin: 0;
  list-style: none;

  li {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 10px 14px;
    font-size: 0.9rem;
    font-weight: 500;
    background: var(--login-card-bg);
    border: 1px solid var(--login-card-border);
    border-radius: 10px;
    backdrop-filter: blur(4px);

    span {
      flex-shrink: 0;
      font-weight: 700;
      color: var(--el-color-primary);
    }
  }
}

.login-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 20px;
  align-self: center;
  justify-self: end;
  width: min(420px, 100%);
  padding: clamp(1.5rem, 3vw, 2.25rem);
  margin-inline: auto;
  background: var(--login-card-bg);
  border: 1px solid var(--login-card-border);
  border-radius: 20px;
  box-shadow:
    0 2px 4px rgb(0 0 0 / 2%),
    0 12px 32px rgb(0 0 0 / 6%);
  backdrop-filter: blur(16px);
  animation: cardIn 0.7s ease;
}

.login-card__brand {
  display: flex;
  gap: 12px;
  align-items: center;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--login-card-border);
}

.login-card__logo-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  background: var(--el-color-primary-light-9);
  border-radius: 14px;
}

.login-card__logo {
  width: 26px;
  height: 26px;
}

.login-card__meta {
  flex: 1;
  min-width: 0;
}

.login-card__title {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 1.05rem;
  font-weight: 650;
  white-space: nowrap;
}

.login-card__version-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 2px;
  font-size: 0.72rem;
}

.login-form__title {
  margin: 0 0 4px;
  font-size: 1rem;
  font-weight: 600;
}

.login-card__form {
  :deep(.el-form-item) {
    margin-bottom: 18px;
  }

  :deep(.el-input__wrapper) {
    background: rgb(0 0 0 / 2%);
    border-radius: 10px;
    box-shadow: 0 0 0 1px rgb(0 0 0 / 6%) inset;
    transition: all 0.2s;

    &:hover {
      box-shadow: 0 0 0 1px rgb(0 0 0 / 10%) inset;
    }

    &.is-focus {
      background: transparent;
      box-shadow: 0 0 0 1.5px var(--el-color-primary) inset;
    }
  }
}

.dark .login-card__form {
  :deep(.el-input__wrapper) {
    background: rgb(255 255 255 / 3%);
    box-shadow: 0 0 0 1px rgb(255 255 255 / 8%) inset;

    &:hover {
      box-shadow: 0 0 0 1px rgb(255 255 255 / 14%) inset;
    }

    &.is-focus {
      background: rgb(255 255 255 / 5%);
      box-shadow: 0 0 0 1.5px var(--el-color-primary) inset;
    }
  }
}

.login-form__social {
  .social-divider {
    display: flex;
    align-items: center;
    margin: 16px 0;

    &__line {
      flex: 1;
      height: 1px;
      background: linear-gradient(to right, transparent, var(--el-border-color-light), transparent);
    }

    &__text {
      padding: 0 14px;
      font-size: 12px;
      color: var(--el-text-color-placeholder);
      white-space: nowrap;
    }
  }

  .social-icons {
    display: flex;
    gap: 14px;
    align-items: center;
    justify-content: center;

    &__item {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      font-size: 18px;
      cursor: pointer;
      border-radius: 10px;
      transition: all 0.2s;

      &:hover {
        background: var(--el-fill-color);
      }
    }
  }
}

.login-card__footer {
  padding-top: 14px;
  font-size: 0.78rem;
  color: var(--el-text-color-placeholder);
  text-align: center;
  border-top: 1px solid var(--login-card-border);

  a {
    margin-left: 4px;
    color: var(--el-text-color-secondary);
    text-decoration: none;
    transition: color 0.2s;

    &:hover {
      color: var(--el-color-primary);
    }
  }
}

@media (max-width: 768px) {
  .login-page__body {
    display: block;
    padding: 0.5rem;
  }

  .login-hero {
    display: none;
  }
}

@keyframes heroIn {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes cardIn {
  from {
    opacity: 0;
    transform: translateY(24px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(12px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}

.fade-slide-enter-to,
.fade-slide-leave-from {
  opacity: 1;
  transform: translateY(0);
}
</style>
