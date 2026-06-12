# AutoBaomiGuan · Next.js Web 版

保密观自动刷课/答题工具的 Web 版（对等移植自 Python CLI）。自托管多用户、无状态代理、SSE 实时日志。

## 技术栈

Next.js 16 (App Router) · TypeScript · shadcn/ui + Tailwind v4 · Node `crypto`（RSA PKCS1 v1.5）· Vitest + MSW。

## 快速开始

```bash
npm install
cp .env.local.example .env.local   # 按需修改 COURSE_PACKET_ID
npm run dev                         # http://localhost:3000
```

## 部署（Docker，推荐自托管）

在一台**出口 IP 能正常访问 baomi 的机器**上运行（baomi 用阿里云 WAF，会封 Cloudflare/部分云机房 IP；普通 VPS/家用机一般没问题）。

镜像由 GitHub Actions 自动构建并推送到 GHCR，**服务器无需本地构建，直接拉取**：

```bash
git clone <repo> && cd baomi-web

# 私有镜像需先登录 GHCR（用一个有 read:packages 权限的 PAT）
echo <YOUR_PAT> | docker login ghcr.io -u Eyeseas --password-stdin

docker compose pull            # 拉取 ghcr.io/eyeseas/baomi-web:latest
docker compose up -d           # 后台启动，监听 0.0.0.0:3000
```

更新版本：`docker compose pull && docker compose up -d`（每次 push 到 main，CI 会自动出新 `latest`）。
改课程包等配置直接编辑 `docker-compose.yml` 的 `environment` 后 `docker compose up -d`。

> 想在本地自己构建镜像（不拉 GHCR）：`docker compose up -d --build`。
> 不用 compose 也可：`docker build -t baomi-web . && docker run -d -p 3000:3000 -e COURSE_PACKET_ID=... baomi-web`

### 自动 HTTPS（Caddy）

仓库提供 `Caddyfile` + `docker-compose.caddy.yml` 叠加层，一条命令拿到自动证书的 HTTPS：

```bash
# 1. 编辑 Caddyfile，把 baomi.example.com 换成你的域名，并将该域名 A 记录解析到本机
# 2. 放行防火墙/安全组的 80、443 端口
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d --build
```

Caddy 自动申请并续期 Let's Encrypt 证书，反代到容器内 `baomi-web:3000`，宿主机只暴露 80/443。生产建议走 HTTPS——cookie 的 `Secure` 在 `NODE_ENV=production` 下默认开启，否则浏览器不会回传登录态。

### 关于 Cloudflare Workers

仓库内附带 OpenNext 适配配置（`wrangler.jsonc` 等），但 **baomi 的阿里云 WAF 会以 405 封禁 Cloudflare 数据中心出口 IP**，需配合 `BAOMI_PROXY_URL`（一台可过 WAF 的机器上跑 `proxy/baomi-proxy.mjs`）才能用。自托管 Docker 无此问题，是更简单的选择。

## 配置（.env.local）

| 变量 | 默认 | 说明 |
|---|---|---|
| COURSE_PACKET_ID | 312bc914-... | 当年课程包，每年更换 |
| STUDY_DELAY_MS | 2000 | 刷课每个资源间延时（毫秒） |
| BAOMI_BASE_URL | https://www.baomi.org.cn | baomi 域名 |

`examId` 在考试流程中由 `getCourseRelateExam` 动态获取，无需配置。

## 架构

浏览器只与 Next.js 通信；Next.js 的 Route Handler 从 httpOnly cookie 取 baomi token 注入请求头后转发/编排 baomi 接口。刷课、考试为耗时任务，用 SSE（`text/event-stream`）边执行边推进度日志。零数据库，每个浏览器会话天然隔离。

## 测试

```bash
npm test        # 全量单元测试（Vitest + MSW，不触达真实接口）
```

## 手动验证清单（需真实保密观账号）

1. 账密登录：输入用户名密码 → 成功后看到「欢迎，<昵称>」。
2. 扫码登录：APP 扫码 → 自动进入面板；二维码失效自动刷新。
3. 查看课程目录 / 学习进度：日志区正确显示。
4. 自动刷课：日志区实时滚动「✓ 完成: …」直到「— 完成 —」。
5. 自动考试：实时显示提交、成绩、状态更新。
6. 退出登录：回到登录页，刷新页面仍为未登录。
7. 凭证过期：手动改坏 cookie 后操作 → 提示重新登录。

## 待真机确认

- `getCourseRelateExam` 返回的 examId 字段名（实现兼容 `examId`/`id`/`exam_id`，见 `lib/baomi/course.ts` 的 `extractExamId`）。
- 扫码 qrToken 是否可直接作为后续接口 token（对齐原 CLI 行为）。

## 合规

仅供个人学习自动化使用，迁移自公开开源项目 NB-XX/AutoBaomiGuan。
