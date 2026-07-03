import request from "@/utils/request";
import type { LoginRequest, LoginResponse } from "./types";

const AUTH_BASE_URL = "/api/admin/auth";

const AuthAPI = {
  /** 登录接口*/
  login(data: LoginRequest) {
    const payload: Pick<LoginRequest, "username" | "password"> = {
      username: data.username,
      password: data.password,
    };

    return request<unknown, LoginResponse>({
      url: `${AUTH_BASE_URL}/login`,
      method: "post",
      data: payload,
    });
  },

  /** 刷新 token 接口*/
  refreshToken(refreshToken: string) {
    return request<unknown, LoginResponse>({
      url: `${AUTH_BASE_URL}/refresh-token`,
      method: "post",
      params: { refreshToken },
      headers: {
        Authorization: "no-auth",
      },
    });
  },

  /** 退出登录接口 */
  logout() {
    return request({
      url: `${AUTH_BASE_URL}/logout`,
      method: "delete",
    });
  },
};

export default AuthAPI;

// 重导出类型
export * from "./types";
