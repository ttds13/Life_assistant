const service = require('./services.service')

async function listCategories(req) {
  return service.listCategories(req.parsedUrl.searchParams)
}

async function listServices(req) {
  return service.listServices(req.parsedUrl.searchParams)
}

async function getServiceDetail(req, params) {
  return service.getServiceDetail(params.id)
}

module.exports = {
  listCategories,
  listServices,
  getServiceDetail,
}
