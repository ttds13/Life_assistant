import { SetMetadata } from '@nestjs/common'

export const ADMIN_PERMISSION_KEY = 'admin_permissions'

export const RequireAdminPermissions = (...permissions: string[]) => SetMetadata(ADMIN_PERMISSION_KEY, permissions)
