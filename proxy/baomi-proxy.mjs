#!/usr/bin/env node
// 零依赖的 baomi 透明反向代理。
//
// 用途：CF Workers 的出口 IP 被 baomi 阿里云 WAF 封禁（返回 405）。
// 把本脚本部署在一台「IP 不被 WAF 封」的机器上（你的家用机 / NAS / 干净 VPS），
// 然后给 Worker 设环境变量 BAOMI_PROXY_URL=https://<本代理地址>，
// Worker 的所有 baomi 请求就会经此机器转发，以该机器的 IP 出站。
//
// 它原样转发 method / path / query / body / 请求头，仅把 Host 改成上游真实域名。
// 运行：  PORT=8080 node baomi-proxy.mjs
// 上游：  默认 https://www.baomi.org.cn，可用 BAOMI_UPSTREAM 覆盖。
//
// 注意：生产环境请在它前面再套一层 HTTPS（如 Caddy/Nginx 反代或隧道），
// 这样 BAOMI_PROXY_URL 才能是 https://，且避免明文暴露。

import http from 'node:http'
import https from 'node:https'

const PORT = Number(process.env.PORT ?? '8080')
const UPSTREAM = new URL(process.env.BAOMI_UPSTREAM ?? 'https://www.baomi.org.cn')

// 不应转发给上游的逐跳头
const HOP_BY_HOP = new Set([
  'host',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
])

const server = http.createServer((req, res) => {
  const headers = {}
  for (const [k, v] of Object.entries(req.headers)) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) headers[k] = v
  }
  // 关键：Host 与 TLS SNI 都指向上游真实域名，WAF 才会按正常站点放行
  headers['host'] = UPSTREAM.host

  const upstreamReq = https.request(
    {
      protocol: UPSTREAM.protocol,
      hostname: UPSTREAM.hostname,
      port: UPSTREAM.port || 443,
      servername: UPSTREAM.hostname,
      method: req.method,
      path: req.url,
      headers,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers)
      upstreamRes.pipe(res)
    },
  )

  upstreamReq.on('error', (err) => {
    res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ message: `代理转发失败: ${err.message}` }))
  })

  req.pipe(upstreamReq)
})

server.listen(PORT, () => {
  console.log(`baomi 反向代理已启动: http://0.0.0.0:${PORT} -> ${UPSTREAM.origin}`)
})
