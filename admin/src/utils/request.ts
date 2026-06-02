import axios, { type InternalAxiosRequestConfig, type AxiosResponse } from "axios";
import qs from "qs";
import { ApiCodeEnum } from "@/enums/api";
import { useUserStoreHook } from "@/stores/user";
import { usePermissionStoreHook } from "@/stores/permission";
import { AuthStorage, redirectToLogin } from "@/utils/auth";

// 记录已重试的请求，防止无限循环
const retriedConfigs = new WeakSet<InternalAxiosRequestConfig>();

// HTTP 请求实例
const http = axios.create({
  baseURL: import.meta.env.VITE_APP_BASE_API,
  timeout: 50000,
  headers: { "Content-Type": "application/json;charset=utf-8" },
  paramsSerializer: (params) => qs.stringify(params, { arrayFormat: "repeat" }),
});

// 请求拦截器
http.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = AuthStorage.getAccessToken();

    if (config.headers.Authorization === "no-auth") {
      delete config.headers.Authorization;
    } else if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// 响应拦截器
http.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>): any => {
    const { responseType } = response.config;

    // 二进制数据直接返回
    if (responseType === "blob" || responseType === "arraybuffer") {
      return response;
    }

    const { code, data, msg, message } = response.data;
    const responseMessage = msg || message;

    if (code === ApiCodeEnum.SUCCESS || code === 0) {
      return data;
    }

    ElMessage.error(responseMessage || "系统出错");
    return Promise.reject(new Error(responseMessage || "系统出错"));
  },

  async (error) => {
    const { config, response } = error;

    if (!response) {
      ElMessage.error("网络连接失败");
      return Promise.reject(error);
    }

    const { code, msg, message } = response.data as ApiResponse;
    const responseMessage = msg || message;
    const requestUrl = String(config?.url || "");
    const isLoginRequest = requestUrl.includes("/auth/login");

    if (isLoginRequest) {
      ElMessage.error(responseMessage || "账号或密码错误");
      return Promise.reject(new Error(responseMessage || "账号或密码错误"));
    }

    // Token 过期：尝试刷新 token 后自动重试一次
    if (code === ApiCodeEnum.ACCESS_TOKEN_INVALID || code === 20001 || code === 20002) {
      // 已重试过，直接跳登录
      if (retriedConfigs.has(config)) {
        await redirectToLogin("登录已过期，请重新登录");
        return Promise.reject(new Error("Token Invalid"));
      }

      retriedConfigs.add(config);

      try {
        const userStore = useUserStoreHook();
        await userStore.refreshTokenOnce();

        const token = AuthStorage.getAccessToken();
        if (token) {
          config.headers.set("Authorization", `Bearer ${token}`);
        }

        return http(config);
      } catch {
        await redirectToLogin("登录已过期，请重新登录");
        return Promise.reject(new Error("Token refresh failed"));
      }
    }

    // Refresh token 失效：无法续期，跳转登录
    if (code === ApiCodeEnum.REFRESH_TOKEN_INVALID) {
      await redirectToLogin("登录已过期，请重新登录", false);
      return Promise.reject(new Error("Token Invalid"));
    }

    // 权限不足：刷新权限快照后提示
    if (code === ApiCodeEnum.PERMISSION_DENIED || code === 20003) {
      const permissionStore = usePermissionStoreHook();
      await permissionStore.reloadPermissionSnapshotOnce();
      ElMessage.error(responseMessage || "权限不足");
      return Promise.reject(new Error(responseMessage || "权限不足"));
    }

    ElMessage.error(responseMessage || "请求失败");
    return Promise.reject(new Error(responseMessage || "请求失败"));
  }
);

export default http;
