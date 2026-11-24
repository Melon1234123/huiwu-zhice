# 会务智策前端

React + TypeScript + Vite 的完整单页应用，生产构建由项目根目录的 Python 服务同源提供。直接运行已构建的应用不需要安装 Node.js。

## 开发与构建

```sh
npm ci
npm run dev
npm run build
```

开发服务通过 `/api` 代理访问 `http://127.0.0.1:8765`；请先启动项目根目录的后端。构建输出到 `../static/`，保留固定入口 `app.js` 和 `style.css`。生产不依赖 CDN，也不请求外部字体。

依赖版本由 package-lock.json 固定：React / React DOM 19.2.7、Vite 8.1.5、TypeScript 7.0.2、React Vite 插件 6.0.3。node_modules 不属于交付源码。

## 桌面工作流回归

在 `frontend/` 下执行。首次安装测试依赖和 Chromium 后，`npm run test:desktop` 可重复检查当前 `../static/` 中的生产构建。

```sh
npm ci
npx playwright install chromium --only-shell
npm run test:desktop
```

修改前端后先运行 `npm run build`。测试会用 Python 3 在回环地址分配随机端口，创建临时 SQLite 数据库，运行本地规则服务，并在结束时清理。11 项检查覆盖首次状态读取、快捷查找、资料对照问答、预算和问答草稿、首页视频暂停，以及三个弹窗的后退导航。

已有 Chromium 时，可用环境变量 `CHROMIUM_PATH` 指定浏览器可执行文件。可通过 `PYTHON` 指定 Python 解释器。追加 `-- --report ../verification/desktop-workflow-results.json` 可保存本次结果和构建哈希。

## 设计与来源

按用户指定的 [frontend-showcase skill](https://github.com/Melon1234123/skill-fronted.git) 执行，采用 Adaptive 模式，用户明确选择“科技发布会：深色沉浸、鲜明视觉、展示感强”。视觉以深海蓝空间、电光蓝操作、冷白正文和紧凑的活动场景光横幅组成；系统信息、任务和实际输出仍优先于装饰。

展示首页使用本地生成的概念图片和 MP4，活动总览用同一张主视觉作横幅。工作台图标使用行内 SVG，导航玻璃效果采用 SVG 与 CSS。系统字体来自操作系统，不捆绑字体文件。React 及其运行时许可见 THIRD_PARTY_NOTICES.txt。

## 实现约束

- 八个业务页面共享同一份项目状态。页面切换保留预算和问答草稿。快捷查找支持 ⌘ K 或 Ctrl K，结果可直达资料和任务。
- Markdown 使用 React 文本节点渲染，拒绝危险协议链接，不使用 HTML 注入。
- 弹窗使用原生 dialog，支持 Esc、焦点约束及点击外部关闭；策划页的标签支持方向键、Home 与 End。
- 减少动态时立即显示最终状态，省略平滑滚动和非必要过渡。
- 真实模型和本地规则显示来源；真实模型请求失败时提示错误并保留可重试内容。
- 密钥由后端私人配置读取，前端源码和构建产物不包含密钥。

功能验证及四视口检查记录由项目的 verification/ 目录保存；真实模型评估与隔离规则模式的浏览器测试分开记录。

## 展示首页

`/#home` 为沉浸展示页，`/#overview` 为业务工作台。首页与工作台切换保留表单草稿。背景视频支持暂停，离开可见区域自动暂停；减少动态偏好使用静态海报。素材、生成来源及授权见 `MEDIA_PROVENANCE.md` 与 `licenses/`。React Bits GlassSurface 使用 SVG 渲染，浏览器不支持时使用 CSS 磨砂后备。
