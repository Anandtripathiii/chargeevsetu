// Serves dist/ with the production headers and rewrites from vercel.json, to test CSP and routing locally.
// Usage: npm run build && node scripts/serve-prod.mjs [port]   (admin Basic auth / edge middleware is not emulated)
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const PORT = Number(process.argv[2] || 4180)
const cfg = JSON.parse(fs.readFileSync('vercel.json', 'utf8'))
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain', '.webp': 'image/webp', '.pmtiles': 'application/octet-stream' }
// vercel path patterns "/x/(.*)" are regexes once anchored
const re = (src) => new RegExp(`^${src}$`)

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  let p = decodeURIComponent(url.pathname)
  for (const h of cfg.headers ?? []) if (re(h.source).test(p)) for (const { key, value } of h.headers) res.setHeader(key, value)
  let file = path.join('dist', p)
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const r = (cfg.rewrites ?? []).find((x) => re(x.source).test(p))
    file = r ? path.join('dist', r.destination) : path.join(file, 'index.html')
  }
  if (!path.resolve(file).startsWith(path.resolve('dist')) || !fs.existsSync(file)) { res.statusCode = 404; return res.end('not found') }
  res.setHeader('Content-Type', TYPES[path.extname(file)] ?? 'application/octet-stream')
  fs.createReadStream(file).pipe(res)
}).listen(PORT, () => console.log(`prod-like server with vercel.json headers: http://localhost:${PORT}`))
