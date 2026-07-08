import { PrismaClient } from '@prisma/client'
import { IMAGE_BIZ_TYPE } from '../src/storage/image-biz-types'

const prisma = new PrismaClient()

interface Candidate {
  url: string
  bizType: string
  bizId: bigint
  uploaderType?: string
  uploaderId?: bigint
}

const report = {
  created: 0,
  updated: 0,
  skipped: 0,
  invalid: [] as Array<{ url: string, reason: string }>,
}

async function main() {
  const candidates: Candidate[] = []

  const [
    users,
    staff,
    services,
    serviceImages,
    banners,
    servicePhotos,
    checkins,
    reviewImages,
    feedbacks,
    ticketMessages,
  ] = await Promise.all([
    prisma.user.findMany({ select: { id: true, avatarUrl: true } }),
    prisma.staff.findMany({ select: { id: true, avatarUrl: true, applicationImages: true } }),
    prisma.service.findMany({ select: { id: true, coverImage: true } }),
    prisma.serviceImage.findMany({ select: { id: true, serviceId: true, url: true } }),
    prisma.homeBanner.findMany({ select: { id: true, imageUrl: true } }),
    prisma.servicePhoto.findMany({ select: { id: true, orderId: true, url: true } }),
    prisma.serviceCheckin.findMany({ select: { id: true, orderId: true, photoUrl: true } }),
    prisma.reviewImage.findMany({ select: { id: true, reviewId: true, url: true } }),
    prisma.feedback.findMany({ select: { id: true, images: true } }),
    prisma.ticketMessage.findMany({ select: { id: true, ticketId: true, images: true } }),
  ])

  users.forEach(item => push(candidates, item.avatarUrl, IMAGE_BIZ_TYPE.USER_AVATAR, item.id, 'user', item.id))
  staff.forEach((item) => {
    push(candidates, item.avatarUrl, IMAGE_BIZ_TYPE.STAFF_AVATAR, item.id, 'staff', item.id)
    jsonStringArray(item.applicationImages).forEach(url => push(candidates, url, IMAGE_BIZ_TYPE.STAFF_APPLICATION, item.id, 'staff', item.id))
  })
  services.forEach(item => push(candidates, item.coverImage, IMAGE_BIZ_TYPE.SERVICE_COVER, item.id))
  serviceImages.forEach(item => push(candidates, item.url, IMAGE_BIZ_TYPE.SERVICE_IMAGE, item.serviceId))
  banners.forEach(item => push(candidates, item.imageUrl, IMAGE_BIZ_TYPE.HOME_BANNER, item.id))
  servicePhotos.forEach(item => push(candidates, item.url, IMAGE_BIZ_TYPE.SERVICE_FINISH_PHOTO, item.orderId))
  checkins.forEach(item => push(candidates, item.photoUrl, IMAGE_BIZ_TYPE.SERVICE_CHECKIN_PHOTO, item.orderId))
  reviewImages.forEach(item => push(candidates, item.url, IMAGE_BIZ_TYPE.REVIEW_IMAGE, item.reviewId))
  feedbacks.forEach(item => jsonStringArray(item.images).forEach(url => push(candidates, url, IMAGE_BIZ_TYPE.FEEDBACK_IMAGE, item.id)))
  ticketMessages.forEach(item => jsonStringArray(item.images).forEach(url => push(candidates, url, IMAGE_BIZ_TYPE.AFTER_SALES_IMAGE, item.ticketId)))
  push(candidates, process.env.DEFAULT_AVATAR_URL, IMAGE_BIZ_TYPE.SYSTEM_DEFAULT_AVATAR, BigInt(0), 'system', BigInt(0))

  for (const candidate of candidates) {
    await upsertFile(candidate)
  }

  const legacy = await prisma.file.updateMany({
    where: { bizType: IMAGE_BIZ_TYPE.LEGACY_ORDER_PHOTO, status: { not: 'deleted' } },
    data: { status: 'orphaned', source: 'migration' },
  })

  console.log(JSON.stringify({ ...report, legacyOrderPhotoOrphaned: legacy.count }, null, 2))
}

function push(
  candidates: Candidate[],
  value: string | null | undefined,
  bizType: string,
  bizId: bigint,
  uploaderType = 'system',
  uploaderId = BigInt(0),
) {
  const url = String(value || '').trim()
  if (!url) return
  candidates.push({ url, bizType, bizId, uploaderType, uploaderId })
}

async function upsertFile(candidate: Candidate) {
  const validation = validateManagedImageUrl(candidate.url)
  if (!validation.ok) {
    report.skipped += 1
    report.invalid.push({ url: candidate.url, reason: validation.reason })
    return
  }

  const existing = await prisma.file.findFirst({
    where: { url: candidate.url },
    orderBy: { id: 'asc' },
  })
  if (existing) {
    await prisma.file.update({
      where: { id: existing.id },
      data: {
        bizType: candidate.bizType,
        bizId: candidate.bizId,
        status: existing.status === 'deleted' ? existing.status : 'active',
        source: existing.source || 'migration',
      },
    })
    report.updated += 1
    return
  }

  await prisma.file.create({
    data: {
      uploaderType: candidate.uploaderType || 'system',
      uploaderId: candidate.uploaderId || BigInt(0),
      bizType: candidate.bizType,
      bizId: candidate.bizId,
      filename: filenameFromUrl(candidate.url),
      url: candidate.url,
      storageKey: storageKeyFromUrl(candidate.url),
      mimeType: mimeTypeFromUrl(candidate.url),
      size: BigInt(0),
      status: 'active',
      source: 'migration',
      visibility: 'private',
    },
  })
  report.created += 1
}

function validateManagedImageUrl(url: string): { ok: true } | { ok: false, reason: string } {
  if (/^(wxfile|blob|file):/i.test(url)) return { ok: false, reason: 'temporary scheme' }
  if (/^https?:\/\/tmp/i.test(url)) return { ok: false, reason: 'temporary host' }
  if (/^[a-z]:\\/i.test(url) || /^\\\\/.test(url)) return { ok: false, reason: 'local path' }
  if (url.startsWith('/api/upload/files/')) return { ok: true }

  let parsed: URL
  try {
    parsed = new URL(url)
  }
  catch {
    return { ok: false, reason: 'invalid url' }
  }

  const apiPrefix = (process.env.API_PREFIX || '/api').replace(/^\/?/, '/').replace(/\/$/, '')
  const localUploadPath = `${apiPrefix}/upload/files/`
  if (parsed.pathname.startsWith(localUploadPath)) {
    const serverBase = process.env.SERVER_BASE_URL || process.env.PUBLIC_BASE_URL || ''
    if (serverBase) {
      try {
        const base = new URL(serverBase)
        if (parsed.host === base.host) return { ok: true }
      }
      catch {
        return { ok: false, reason: 'invalid server base url' }
      }
    }
    if (isLocalHostname(parsed.hostname)) return { ok: true }
  }

  const publicBase = process.env.OSS_PUBLIC_BASE_URL || 'https://gym-face-bucket.oss-cn-shenzhen.aliyuncs.com'
  try {
    const base = new URL(publicBase)
    if (parsed.host === base.host) return { ok: true }
  }
  catch {
    return { ok: false, reason: 'invalid OSS_PUBLIC_BASE_URL' }
  }

  return { ok: false, reason: 'external url' }
}

function storageKeyFromUrl(url: string) {
  if (url.startsWith('/api/upload/files/')) {
    return url.replace(/^\/api\/upload\/files\//, '')
  }
  try {
    const pathname = decodeURIComponent(new URL(url).pathname)
    const apiPrefix = (process.env.API_PREFIX || '/api').replace(/^\/?/, '/').replace(/\/$/, '')
    const localUploadPath = `${apiPrefix}/upload/files/`
    if (pathname.startsWith(localUploadPath)) {
      return pathname.slice(localUploadPath.length)
    }
    return pathname.replace(/^\/+/, '')
  }
  catch {
    return url
  }
}

function filenameFromUrl(url: string) {
  const key = storageKeyFromUrl(url)
  return key.split('/').pop() || 'image'
}

function mimeTypeFromUrl(url: string) {
  const lower = storageKeyFromUrl(url).split('?')[0].toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.bmp')) return 'image/bmp'
  return 'image/jpeg'
}

function jsonStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map(item => typeof item === 'string' ? item : '').filter(Boolean)
}

function isLocalHostname(hostname: string) {
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname.startsWith('192.168.')
    || hostname.startsWith('10.')
    || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
