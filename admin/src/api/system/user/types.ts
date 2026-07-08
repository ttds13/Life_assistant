import type { BaseQueryParams } from "@/api/common";

export interface UserInfo {
  userId?: string;
  username?: string;
  nickname?: string;
  avatar?: string;
  avatarOssUrl?: string;
  avatarDisplayUrl?: string;
  roles: string[];
  perms: string[];
}

export interface UserQueryParams extends BaseQueryParams {
  keywords?: string;
  status?: number;
  deptId?: string;
  createTime?: [string, string];
}

export interface UserItem {
  id: string;
  avatar?: string;
  createTime?: Date;
  deptName?: string;
  email?: string;
  gender?: number;
  mobile?: string;
  nickname?: string;
  roleNames?: string;
  status?: number;
  username?: string;
}

export interface UserForm {
  id?: string;
  avatar?: string;
  deptId?: string;
  email?: string;
  gender?: number;
  mobile?: string;
  nickname?: string;
  roleIds?: number[];
  status?: number;
  username?: string;
}

export interface UserProfileDetail {
  id?: string;
  username?: string;
  nickname?: string;
  avatar?: string;
  avatarOssUrl?: string;
  avatarDisplayUrl?: string;
  gender?: number;
  mobile?: string;
  email?: string;
  deptName?: string;
  roleNames?: string;
  createTime?: Date;
}

export interface UserProfileForm {
  nickname?: string;
  avatar?: string;
  gender?: number;
}

export interface PasswordChangeForm {
  oldPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

export interface PasswordVerifyForm {
  password?: string;
}

export interface MobileUpdateForm {
  mobile?: string;
  code?: string;
  password?: string;
}

export interface EmailUpdateForm {
  email?: string;
  code?: string;
  password?: string;
}
