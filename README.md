# LoRA Tag（TagMaster Pro UI）

一个面向 **图片数据集打标/整理** 的前端工具：把图片文件夹载入画布，通过本地或云端的 **OpenAI 兼容接口** 自动生成标签（写入同名 `.txt`），并提供标签编辑、排序、PNG 元数据读取（ComfyUI/A1111）、以及带 `@` 引用图片的轻量 AI 对话面板。

> 技术栈：Vue 3 + TypeScript + Vite（纯前端）。  
> 重要：创建/修改 `.txt` 依赖浏览器的 **File System Access API**，需要用户手动授权选择文件夹；浏览器支持度见下文。

---

## 目录

- [核心功能](#核心功能)
- [快速开始（用户）](#快速开始用户)
- [API 配置（本地/云端，OpenAI 兼容）](#api-配置本地云端openai-兼容)
- [打标工作流](#打标工作流)
- [Tag 视图：编辑与拖拽排序](#tag-视图编辑与拖拽排序)
- [图片信息：读取 ComfyUI/A1111 PNG 元数据](#图片信息读取-comfyuia1111-png-元数据)
- [AI 对话：@ 引用画布图片 + 流式输出](#ai-对话-引用画布图片--流式输出)
- [主题：夜间模式](#主题夜间模式)
- [浏览器与权限说明](#浏览器与权限说明)
- [部署上线（最小成本：静态站）](#部署上线最小成本静态站)
- [开发者：本地开发与构建](#开发者本地开发与构建)
- [隐私与安全](#隐私与安全)
- [常见问题（FAQ）](#常见问题faq)

---

## 核心功能

### 1) 文件夹画布管理

- 选择一个本地图片文件夹（用户授权）
- 以“卡片节点”方式把图片放到画布上，支持拖拽移动、缩放、框选、多选
- 选择节点后，自动读取/创建同名 `.txt`（例如 `xxx.png` 对应 `xxx.txt`）

### 2) 一键自动打标（写入 txt）

- 支持对选中图片（可多选批量）调用 OpenAI 兼容 `chat/completions` 接口生成标签
- 生成结果直接写入对应 `.txt`（覆盖写入）
- 顶部进度条显示 **真实进度**（按节点/阶段推进）
- 自动对图片进行压缩（默认最大边 768，JPEG），减少请求体积

### 3) Tag 视图（标签芯片化）

- 以“标签 chips”方式展示当前 `.txt`（逗号分隔）
- 单个删除、原始文本编辑
- **拖拽排序**：拖动 tag 到任意位置，松手后 `.txt` 顺序实时同步
- 拖拽时带“占位预览 chip”，明确落点

### 4) PNG 元数据读取（ComfyUI / A1111）

- 支持读取 PNG `tEXt / iTXt / zTXt` 元数据（含压缩字段）
- 支持解析 **ComfyUI** 的 `prompt/workflow` 以及 **A1111** 的 `parameters`
- 显示“原始元数据”并提供：
  - 一键复制到剪贴板
  - 导出为 JSON 文件（用户选择保存位置；不支持时自动下载）

### 5) AI 对话（轻量工具栏第 4 个面板）

- 通过 OpenAI 兼容 `chat/completions` 进行对话
- 支持 **流式输出**（可用时）
- 输入框里使用 `@` 可引用画布上的图片节点：
  - 弹出候选列表（支持键盘上下/回车选择）
  - 选中后生成带缩略图+文件名的 tag
  - 发送后该 tag 会挂在这条消息下方（表示引用关系）
- 如果模型/接口不支持图片输入，返回报错时会提示用户“当前模型不支持图片上传”

### 6) 夜间模式

- 右上角月亮按钮切换
- 支持从按钮位置向外扩散的圆形过渡（支持 View Transitions 的浏览器）

---

## 快速开始（用户）

1. 打开网页（本地或线上）
2. 点击画布上的“上传你的图片文件夹”（或等价入口）选择一个图片目录并授权
3. 在画布选中图片节点
4. 在右侧 Sidebar：
   - 点击“生成打标tag”生成并写入 `.txt`
   - 切到“Tag 视图”查看、编辑、拖拽排序
   - 切到“图片信息”读取 PNG 元数据（ComfyUI/A1111）
   - 切到“对话”与模型聊天，或 `@` 引用画布图片进行描述/问答

---

## API 配置（本地/云端，OpenAI 兼容）

右上角顶部栏有两部分：

- **本地/云端按钮**：点击切换当前使用的 API（本地 API / 云端 API）
- **设置按钮**：打开 API 配置弹窗（Base URL / Model / API Key）

### 本地 API（LM Studio / 其它本地推理）

- Base URL 示例：`http://127.0.0.1:1234/v1`
- Model：填写 LM Studio 当前加载的模型名（或你接口要求的 model 字段）
- CORS：你选择静态站部署时，需要在 LM Studio 中开启 CORS，并允许你的站点 Origin（例如 `https://xxx.pages.dev`）

### 云端 API（OpenAI/兼容服务）

- Base URL 示例：`https://api.openai.com/v1`（或你的兼容服务地址）
- API Key：只在本机浏览器 `localStorage` 保存（不会上传到本项目服务端，因为本项目没有后端）

---

## 打标工作流

1. 选择图片节点（可多选）
2. 点击“生成打标tag”
3. 系统会：
   - 读取图片并压缩为 JPEG（减少体积）
   - 构造系统提示词（`src/assets/systemprompt.txt` + 你在 UI 勾选的属性限制）
   - 调用 `POST {BaseURL}/chat/completions`
   - 将结果写入同名 `.txt`（覆盖写入）

> 如果模型返回空内容或不支持多模态，会弹出提示引导你换用支持图片输入的模型。

---

## Tag 视图：编辑与拖拽排序

- `.txt` 以英文逗号 `,` 分割为 tags，并在 Tag 视图以 chip 显示
- **拖拽排序**：
  - 按住一个 tag 拖动
  - 移动到两个 tag 中间时，会出现一个浅色“占位 chip”（预览松手落点）
  - 松手后会立即写回 `.txt` 并保存到文件夹

---

## 图片信息：读取 ComfyUI/A1111 PNG 元数据

在“图片信息”面板，选中单张图片后：

- 自动读取 PNG 元数据块（含压缩文本块）
- 解析常见字段：
  - A1111 `parameters`（常见格式：steps/cfg/sampler/seed/size/model 等）
  - ComfyUI `prompt`/`workflow`
- “原始元数据”区：
  - 复制按钮：复制 JSON 到剪贴板
  - 导出按钮：导出 JSON 文件（支持 File Picker 时可选保存路径）

---

## AI 对话：@ 引用画布图片 + 流式输出

在“对话”面板：

- 输入 `@` 会弹出画布图片列表
- 用上下键选择，回车确认
- 发送后引用图片会显示在该消息下方

流式输出：

- 如果接口支持 streaming，会边生成边显示
- 不支持则自动降级为非流式（一次性返回）

---

## 主题：夜间模式

- 右上角月亮按钮切换夜间/白天
- 支持圆形扩散过渡（支持 View Transitions 的浏览器）
- 夜间配色接近 GitHub Dark 的层级与对比度（并保留玻璃质感）

---

## 浏览器与权限说明

### 必需能力：读写本地文件夹

项目创建/修改 `.txt` 依赖 **File System Access API**：

- 通常在 **Chrome / Edge** 等 Chromium 浏览器体验最好
- 用户必须手动选择文件夹并授权（网页不能绕过授权）
- 不支持该 API 的浏览器将无法直接写入文件夹（需要做“导出下载”的降级方案）

### 本地 API 跨域（CORS）

如果你希望网页直接访问用户的 `http://127.0.0.1:1234`：

- 本地服务必须允许跨域（CORS）
- 通常需要把站点域名加入允许列表（Origin）

---

## 部署上线（最小成本：静态站）

本项目是纯前端，最省钱的方式是部署为静态站：

- Cloudflare Pages（推荐）
- GitHub Pages
- Vercel / Netlify

### 一般流程

1. 本地安装依赖：`npm ci`
2. 构建：`npm run build`
3. 将 `dist/` 作为静态站发布
4. 开启 SPA 回退：所有路径回退到 `index.html`

> 说明：`/api/hwinfo` 仅在开发环境启用；生产环境 BottomBar 改为浏览器端探测（避免静态站 404）。

### Cloudflare Pages（推荐）

1. 把仓库推到 GitHub（或直接上传到 Pages）
2. 在 Cloudflare Pages 新建项目并选择仓库
3. 构建设置：
   - Build command：`npm run build`
   - Build output directory：`dist`
4. SPA 回退（很重要）：
   - 开启“单页应用（SPA）回退到 `index.html`”（或配置等价的 rewrite 规则）

### GitHub Pages（免费但配置稍多）

方式一：直接把 `dist/` 发布到 `gh-pages` 分支（需要你自己写 CI 或手动上传）。

方式二：GitHub Actions 构建并发布（推荐）。

> 提醒：如果你的站点部署在子路径（例如 `https://xxx.github.io/repo/`），需要在 Vite 配置 `base`，否则静态资源路径会不对。

### HTTPS 站点访问本地 LM Studio 的注意事项

你的静态站通常是 **HTTPS**，而 LM Studio 默认是 **HTTP（127.0.0.1）**：

- 部分浏览器/策略会把 `https://站点` → `http://127.0.0.1` 视为“混合内容/不安全请求”而拦截
- 即便开启了 CORS，也可能仍被浏览器安全策略阻止

建议：

- 本地使用时：直接用 `npm run dev` 打开本地站点（同为 HTTP）进行联调
- 线上分享给用户时：优先引导用“云端 API”，或指导用户使用支持的浏览器/配置

---

## 开发者：本地开发与构建

### 环境要求

- Node.js（建议 18+ 或 20+）
- npm

### 命令

- 开发：`npm run dev`
- 构建：`npm run build`
- 本地预览：`npm run preview`

---

## 项目结构（关键文件）

- `src/store.ts`
  - API 配置（本地/云端）与持久化
  - 选中节点时读取/保存同名 `.txt`
  - 调用 OpenAI 兼容接口进行打标（含图片压缩）
- `src/components/CanvasArea.vue`
  - 画布与节点交互（拖拽/缩放/框选）
- `src/components/Sidebar.vue`
  - 打标面板、Tag 视图（含拖拽排序）、图片信息面板（PNG 元数据）、AI 对话面板（@ 引用）
- `src/components/TopBar.vue`
  - 本地/云端切换、API 设置弹窗、夜间模式切换（含圆形过渡）
- `src/utils/image.ts`
  - 浏览器端图片压缩与 data URL 生成

---

## 配置存储（localStorage）

本项目会把以下配置存到浏览器本地（方便刷新后不丢失）：

- `loraTag.theme`：`dark` / `light`
- `loraTag.apiConfig`：
  - `isLocalApi`
  - `localApiBaseUrl / localApiModel / localApiKey`
  - `cloudApiBaseUrl / cloudApiModel / cloudApiKey`

---

## 隐私与安全

- 本项目默认不提供后端服务；所有逻辑在浏览器本地运行
- API Key / BaseURL / Model 等配置存储在浏览器 `localStorage`
- 调用打标/对话接口时：
  - 文本提示词会发送到你配置的接口
  - 图片会在本地压缩后以 `image_url`（data URL）形式发送到你配置的接口
- 如果你使用云端 API，请自行评估数据合规与敏感信息风险

---

## 常见问题（FAQ）

### Q1：上线后还能写入本地文件夹的 `.txt` 吗？

可以，但前提是：

- 用户浏览器支持 File System Access API（推荐 Chrome/Edge）
- 用户必须手动选择文件夹并授权

不支持的浏览器需要做“导出下载”的替代方案（当前版本未内置）。

### Q2：本地 LM Studio 能用吗？为什么请求失败？

常见原因：

- LM Studio 未开启 CORS
- 允许的 Origin 没有包含你的站点域名
- `Base URL / Model` 填写不正确
- 模型不支持图片输入（多模态）

排查清单（建议按顺序）：

1. 确认 LM Studio 的 HTTP 服务已启动（端口与你填写的一致）
2. 在浏览器直接访问 `http://127.0.0.1:1234/v1/models`（或你服务提供的等价接口）是否有响应
3. 打开浏览器 DevTools → Network，看请求是否被 CORS / Mixed Content 拦截
4. 如果是多模态打标失败：换用支持图片输入的模型（或改用云端多模态模型）

### Q3：为什么“图片信息”里显示“有元数据但无法识别”？

不同工具写入的字段名可能不同。本项目会尽量解析 ComfyUI/A1111 常见字段，并始终提供“原始元数据”供你复制/导出排查。

### Q4：为什么我在非 Chrome 浏览器上无法选择文件夹/写入 txt？

这通常是因为浏览器不支持或限制了 File System Access API。建议使用 Chrome/Edge。

### Q5：我不想让网页直接改我文件夹里的 txt，有没有更安全的模式？

可以做“导出模式”（把生成的 `.txt` 打包下载，用户手动覆盖回去），但当前版本未内置。如果你需要，我可以帮你加一个“导出全部 txt（zip）”的功能作为替代路径。

---

## License

当前仓库未声明许可证（License）。如需开源分发，请补充 `LICENSE` 文件并确认依赖协议。
