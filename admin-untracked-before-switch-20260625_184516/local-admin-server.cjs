const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const port = Number(process.env.ADMIN_LOCAL_PORT || 5175)
const distDir = path.join(__dirname, 'dist')
const apiTarget = process.env.ADMIN_API_TARGET || 'http://127.0.0.1:3100'

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
}

function send(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, headers)
  res.end(body)
}

function serveFile(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  let pathname = decodeURIComponent(url.pathname)

  if (pathname === '/') {
    send(res, 302, '', { Location: '/admin/' })
    return
  }

  if (!pathname.startsWith('/admin/')) {
    send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' })
    return
  }

  pathname = pathname.replace(/^\/admin\/?/, '')
  const relativePath = pathname || 'index.html'
  const resolved = path.resolve(distDir, relativePath)

  if (!resolved.startsWith(path.resolve(distDir))) {
    send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain; charset=utf-8' })
    return
  }

  fs.stat(resolved, (statErr, stat) => {
    const filePath = !statErr && stat.isFile() ? resolved : path.join(distDir, 'index.html')
    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        send(res, 500, 'Failed to read admin asset', { 'Content-Type': 'text/plain; charset=utf-8' })
        return
      }
      const ext = path.extname(filePath).toLowerCase()
      send(res, 200, data, {
        'Content-Type': mimeTypes[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      })
    })
  })
}

function proxyApi(req, res) {
  const incomingUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const targetUrl = new URL(incomingUrl.pathname.replace(/^\/prod-api/, '') + incomingUrl.search, apiTarget)

  const proxyReq = http.request(targetUrl, {
    method: req.method,
    headers: {
      ...req.headers,
      host: targetUrl.host,
    },
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
    proxyRes.pipe(res)
  })

  proxyReq.on('error', (err) => {
    send(res, 502, JSON.stringify({ code: 10000, message: err.message, data: null }), {
      'Content-Type': 'application/json; charset=utf-8',
    })
  })

  req.pipe(proxyReq)
}

const server = http.createServer((req, res) => {
  if ((req.url || '').startsWith('/prod-api/')) {
    proxyApi(req, res)
    return
  }
  serveFile(req, res)
})

server.listen(port, '0.0.0.0', () => {
  console.log(`local admin: http://localhost:${port}/admin/`)
  console.log(`admin api proxy: /prod-api -> ${apiTarget}`)
})
