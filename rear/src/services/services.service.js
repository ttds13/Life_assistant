const { BusinessError } = require('../common/errors/business-error')
const { ErrorCode } = require('../common/errors/error-code')
const repository = require('./services.repository')

function parsePositiveInteger(value, fallback, fieldName) {
  if (value === undefined || value === null || value === '') return fallback
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BusinessError(ErrorCode.COMMON_BAD_REQUEST, `${fieldName} 必须是正整数`, 400)
  }
  return parsed
}

function parseOptionalInteger(value, fieldName) {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isInteger(parsed)) {
    throw new BusinessError(ErrorCode.COMMON_BAD_REQUEST, `${fieldName} 必须是整数`, 400)
  }
  return parsed
}

async function listCategories(searchParams) {
  const status = parseOptionalInteger(searchParams.get('status'), 'status')
  return repository.findCategories({ status: status ?? 1 })
}

async function listServices(searchParams) {
  const page = parsePositiveInteger(searchParams.get('page'), 1, 'page')
  const pageSize = parsePositiveInteger(searchParams.get('pageSize'), 20, 'pageSize')
  const categoryId = parseOptionalInteger(searchParams.get('categoryId'), 'categoryId')
  const status = parseOptionalInteger(searchParams.get('status'), 'status')
  const keyword = searchParams.get('keyword')?.trim() || ''

  if (pageSize > 100) {
    throw new BusinessError(ErrorCode.COMMON_BAD_REQUEST, 'pageSize 不能超过 100', 400)
  }

  const allItems = await repository.findServices({
    categoryId,
    keyword,
    status: status ?? 1,
  })

  const start = (page - 1) * pageSize
  const items = allItems.slice(start, start + pageSize)

  return {
    items,
    page,
    pageSize,
    total: allItems.length,
  }
}

async function getServiceDetail(idText) {
  const id = parsePositiveInteger(idText, null, 'id')
  const service = await repository.findServiceById(id)

  if (!service || service.status !== 1) {
    throw new BusinessError(ErrorCode.SERVICE_NOT_FOUND, '服务不存在', 404)
  }

  return service
}

module.exports = {
  listCategories,
  listServices,
  getServiceDetail,
}
