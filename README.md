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
