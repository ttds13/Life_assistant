export const IMAGE_BIZ_TYPE = {
  USER_AVATAR: 'user_avatar',
  STAFF_AVATAR: 'staff_avatar',
  STAFF_APPLICATION: 'staff_application',
  SERVICE_FINISH_PHOTO: 'service_finish_photo',
  SERVICE_CHECKIN_PHOTO: 'service_checkin_photo',
  FEEDBACK_IMAGE: 'feedback_image',
  AFTER_SALES_IMAGE: 'after_sales_image',
  HOME_BANNER: 'home_banner',
  SERVICE_COVER: 'service_cover',
  SERVICE_IMAGE: 'service_image',
  ADMIN_AVATAR: 'admin_avatar',
  RICH_TEXT_IMAGE: 'rich_text_image',
  REVIEW_IMAGE: 'review_image',
  SYSTEM_DEFAULT_AVATAR: 'system_default_avatar',
  ADMIN_IMAGE: 'admin_image',
  LEGACY_IMAGE: 'image',
  LEGACY_ORDER_PHOTO: 'order_photo',
} as const

export const IMAGE_BIZ_TYPES = Object.values(IMAGE_BIZ_TYPE)

export type ImageBizType = typeof IMAGE_BIZ_TYPES[number]

export function normalizeImageBizType(value?: string | null): ImageBizType {
  const normalized = String(value || '').trim()
  if (!normalized) return IMAGE_BIZ_TYPE.ADMIN_IMAGE
  if ((IMAGE_BIZ_TYPES as string[]).includes(normalized)) return normalized as ImageBizType
  return IMAGE_BIZ_TYPE.ADMIN_IMAGE
}

export function isAllowedImageBizType(value?: string | null): boolean {
  return (IMAGE_BIZ_TYPES as string[]).includes(String(value || '').trim())
}
