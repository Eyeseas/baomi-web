# AutoBaomiGuan Next.js 重写设计文档

- 日期：2026-06-12
- 状态：已确认，待生成实现计划
- 背景：将现有的保密观（baomi.org.cn）自动刷课/答题 **Python CLI 脚本** 重写为 Next.js Web 应用。

## 1. 目标与范围

把现有 CLI（`main.py` / `login.py` / `course.py`）的全部能力 web 化，做到**对等移植**：

| 原 CLI 能力 | Web 版 |
|---|---|
| 扫码登录（终端 ASCII 二维码） | 网页渲染二维码图片 + 轮询 |
| 账号密码登录（RSA 加密） | 服务端 RSA 加密 + 表单登录 |
| 查看课程目录 | 目录展示 |
| 查看学习进度 | 进度展示 |
| 自动刷课 | SSE 实时日志刷课 |
| 自动考试 | SSE 实时日志考试 |

**不在本期范围**：自建账号体系、数据库持久化、后台常驻任务、定时任务、多课程包并行管理、按节选择性刷课。

## 2. 关键决策（已确认）

| 维度 | 决策 |
|---|---|
| 使用场景 | 自托管多用户，会话隔离 |
| 身份/存储 | **无状态代理**：baomi token 存浏览器 httpOnly cookie，服务端不落库，零数据库 |
| 长任务 | **SSE 实时流式日志**：边执行边推进度，任务绑定当前 HTTP 连接，关页面即停（刷课幂等可重跑） |
| 功能范围 | 对等移植上表全部六项 |
| 框架 | Next.js 15 App Router + TypeScript |
| UI | shadcn/ui + Tailwind CSS |
| RSA 加密 | 服务端 Node `crypto`，PKCS1 v1.5 |
| 代理粒度 | 每个业务动作建专用 Route Handler（非通用透传），因刷课/考试需服务端编排 |

## 3. 架构概览

```
浏览器 ──HTTP──> Next.js (App Router, 自托管)
                  ├─ Route Handlers：代理 / 编排 baomi 请求
                  ├─ httpOnly cookie 存 baomi token（每浏览器隔离）
                  └─ SSE 流：刷课 / 考试边跑边推进度
                                    │
                                    └──> www.baomi.org.cn（注入 token / siteId 头）
```

浏览器从不直接请求 baomi.org.cn（避开 CORS、自定义头限制、token 暴露）。所有外呼经由 Next.js 服务端，由服务端从 cookie 取 token 注入请求头。

## 4. 目录结构与组件

```
app/
  page.tsx                     入口：按登录态渲染登录卡片或仪表盘
  api/
    auth/
      login/route.ts           账密登录：RSA 加密 → loginInNew.do → 设 cookie
      qr/route.ts              POST 取二维码内容; GET 轮询 checkQrToken, 成功设 cookie
      check/route.ts           checkToken.do 校验当前 cookie，返回昵称
      logout/route.ts          清 cookie
    course/
      info/route.ts            getCoursePacket，课程信息
      directory/route.ts       getCourseDirectoryList，课程目录
      progress/route.ts        getCourseUserStatistic，学习进度
    study/route.ts             SSE：自动刷课编排
    exam/route.ts              SSE：自动考试编排
lib/baomi/
  client.ts        带 token/siteId 头的 fetch 封装（从 cookie 读 token）
  crypto.ts        RSA PKCS1 v1.5 加密（移植 login.py 的 encrypt/rsa_encrypt_pkcs1v15）
  qr.ts            qrToken 解析（移植 login.py 的 parse_qr_token）
  course.ts        刷课 / 考试编排逻辑（移植 course.py 的 CourseManager）
  constants.ts     URL 常量 + 从 env 读取的配置
lib/
  cookies.ts       读写 token cookie 辅助
components/
  ui/              shadcn 组件
  LoginCard.tsx    扫码 Tab + 账密 Tab
  CoursePanel.tsx  四个操作按钮 + 目录/进度展示
  LogConsole.tsx   SSE 滚动日志区（复刻 CLI 彩色输出）
```

设计原则：单元职责单一。`crypto` / `client` / `qr` / `course` 为纯逻辑，可脱离 HTTP 独立测试；route 只负责 HTTP / cookie / 流；组件只负责展示。

## 5. 数据流

### 5.1 账密登录
表单 → `POST /api/auth/login {loginName, passWord}` → 服务端 `getPublishKey.do` 取公钥 → RSA 加密用户名密码 → `loginInNew.do` → 取 token → `Set-Cookie`（httpOnly）→ 返回成功。

> **明文密码只在该次请求体出现，不存浏览器、不落盘。**

### 5.2 扫码登录
`POST /api/auth/qr` → 服务端 `getQrToken.do` 取 `{qrContent, qrToken}` → 前端用 qrContent 渲染二维码图 → 每 3s `GET /api/auth/qr?qrToken=` 轮询 `checkQrToken.do`：

- 返回 `1`：登录成功，服务端把 **qrToken 本身作为 token** 设 cookie，返回成功（对齐原 `main.py` 中扫码成功后以 `qr_token` 作 token 的行为）。
- 返回 `-1`：二维码失效，前端自动重新请求二维码。
- 其他：继续轮询。

### 5.3 读类操作（目录 / 进度 / 信息）
`GET /api/course/*` → `client` 注入头 → baomi → JSON 透传给前端渲染。

### 5.4 自动刷课（SSE）
`EventSource('/api/study')` → 服务端 `ReadableStream`：

1. `getCourseDirectoryList(coursePacketId)` 取目录
2. 遍历每个章节 `section` → 每个小节 `subDirectory`
3. `getCourseResourceList` 取资源列表
4. 逐个 `saveStudyRecord`（study/length/time 均填资源总时长）
5. 每完成一个资源 enqueue `{type:'progress', name, ok}`
6. 每个资源之间延时 `STUDY_DELAY_MS`（默认 2000ms）
7. 全部完成 enqueue `{type:'done'}`

### 5.5 自动考试（SSE）
`EventSource('/api/exam')` → 服务端 `ReadableStream`：

1. **`getCourseRelateExam(coursePacketId)` 动态获取 examId**（不再硬编码）
2. `getExamContentData.do` 取试卷答案，并取响应里的新 `randomId`
3. 遍历 `typeList → questionList`，以每题 `answer` 作为 `userAnswer`，`userScoreRate=100%` 构造提交数据
4. `saveExamResultJc.do` 提交
5. `getExamResultMaxScore.do` 查成绩
6. `updateCoursePackageExamInfo.do` 更新完成状态
7. 每步 enqueue 对应进度 / 结果事件

## 6. 错误处理

| 场景 | 处理 |
|---|---|
| baomi 接口失败 / 非 200 | SSE 推 `{type:'error', message}` 红色显示；读类接口返回对应 HTTP 状态 + JSON message |
| token 失效（checkToken 为假 / 接口未授权） | 清 cookie，前端跳登录，提示「凭证已过期，请重新登录」 |
| 新账号 token 无效（参见仓库 issue #10） | 失败时提示「新账号请先在保密观 APP 播放任意课程视频后再试」 |
| 二维码失效（轮询返回 `-1`） | 前端自动刷新二维码 |
| 公钥获取 / RSA 加密失败 | 登录接口返回 502 + message |
| 用户关闭页面 / 断网 | 服务端监听 `request.signal` abort，停止 SSE 循环、释放资源 |

## 7. 安全与合规

- cookie：`httpOnly` + `SameSite=Lax`，生产环境（https）加 `Secure`。
- 不记录明文密码；token 仅存 cookie，服务端不持久化。
- 保留原脚本的请求延时（`STUDY_DELAY_MS`，默认 2000ms），避免对 baomi 频繁请求。
- 用途声明：仅供个人学习自动化使用，迁移自公开开源项目 NB-XX/AutoBaomiGuan。

## 8. 配置（`.env`）

| 变量 | 默认值 | 说明 |
|---|---|---|
| `COURSE_PACKET_ID` | 现有 Python 常量值 `312bc914-8e11-421b-b9bc-e900fe1a4e50` | 当年课程包标识，每年更换，故置于 env |
| `STUDY_DELAY_MS` | `2000` | 刷课时每个资源之间的延时 |
| `BAOMI_BASE_URL` | `https://www.baomi.org.cn` | baomi 域名，便于将来切换 |

`examId` 改为运行时由 `getCourseRelateExam` 动态获取，**不设环境变量**。

## 9. 测试策略

- **Vitest 单元**：
  - `crypto`：给定公钥加密，产出能被对应私钥解密验证。
  - `qr`：qrToken 解析正确 / 缺字段抛错。
  - `course`：mock fetch，验证刷课遍历顺序、考试答案构造（以正确答案填 userAnswer）与调用序列。
- **MSW 集成**：mock baomi 接口测 route handler —— 登录正确设 cookie、SSE 事件序列正确、token 失效返回 401。
- **手动验证清单**：真实账号的端到端流程无法自动化，提供逐项手测步骤；可选 Playwright UI 冒烟。

## 10. 实现时待验证点

1. `getCourseRelateExam` 返回体中 examId 的确切字段名（原代码定义了 `get_exam_info` 但未真正使用，字段未知）——写代码时打印一次真实响应确认。
2. `checkQrToken.do` 成功后，确认 qrToken 可直接作为后续接口的 token（对齐原 CLI 行为，需真机验证）。
