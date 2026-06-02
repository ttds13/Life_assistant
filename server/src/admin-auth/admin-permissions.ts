export const ADMIN_ROLE = {
  SUPER_ADMIN: 'super_admin',
  OPERATOR: 'operator',
  FINANCE: 'finance',
} as const

export type AdminRole = typeof ADMIN_ROLE[keyof typeof ADMIN_ROLE]

export const ADMIN_ROLE_RESPONSE = {
  [ADMIN_ROLE.SUPER_ADMIN]: 'SUPER_ADMIN',
  [ADMIN_ROLE.OPERATOR]: 'OPERATOR',
  [ADMIN_ROLE.FINANCE]: 'FINANCE',
} as const

const OPERATOR_PERMISSIONS = [
  'dashboard:view',
  'order:list',
  'order:detail',
  'order:assign',
  'user:list',
  'user:detail',
  'staff:list',
  'staff:audit',
  'service:list',
  'service:create',
  'service:update',
]

const FINANCE_PERMISSIONS = [
  'dashboard:view',
  'finance:payment:list',
  'finance:refund:list',
  'finance:refund:audit',
  'finance:withdraw:list',
  'finance:withdraw:audit',
]

export function normalizeAdminRole(role: string | null | undefined): AdminRole {
  if (role === ADMIN_ROLE.OPERATOR || role === ADMIN_ROLE.FINANCE) return role
  return ADMIN_ROLE.SUPER_ADMIN
}

export function getAdminRoles(role: string | null | undefined): string[] {
  const normalized = normalizeAdminRole(role)
  return [ADMIN_ROLE_RESPONSE[normalized]]
}

export function getAdminPermissions(role: string | null | undefined): string[] {
  const normalized = normalizeAdminRole(role)
  if (normalized === ADMIN_ROLE.SUPER_ADMIN) return ['*']
  if (normalized === ADMIN_ROLE.FINANCE) return FINANCE_PERMISSIONS
  return OPERATOR_PERMISSIONS
}
