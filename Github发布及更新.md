# 刻度｜专注计划助手

刻度是一个 Vite + React + TypeScript 构建的本地优先网页应用。它可以安装到 Windows 桌面或安卓主屏幕，但仍然是网页应用（PWA），不是原生 APK。

任务、专注、复盘和睡眠数据默认保存在当前浏览器的 IndexedDB 中。发布新版不会覆盖这些数据，但手动清除站点数据、换浏览器或更换网站地址后不会自动迁移，因此请定期在“设置 → 数据管理”导出 JSON 备份。

## 本地运行

```bash
npm install
npm run dev
```

提交前检查：

```bash
npm run lint
npm run test -- --run
npm run build
```

## 第一次发布到 GitHub Pages

1. 登录 GitHub，点击 **New repository**，创建一个空仓库，例如 `kedu-focus`。不要勾选自动创建 README，以免首次推送冲突。
2. 在本项目目录初始化 Git，并把下面地址中的用户名和仓库名替换成自己的：

   ```bash
   git init
   git add .
   git commit -m "Initial release"
   git branch -M main
   git remote add origin https://github.com/你的用户名/kedu-focus.git
   git push -u origin main
   ```

3. 打开仓库的 **Settings → Pages**，在 **Build and deployment → Source** 选择 **GitHub Actions**。
4. 打开仓库的 **Actions** 页面，等待 `Deploy GitHub Pages` 变为绿色。之后访问 `https://你的用户名.github.io/kedu-focus/`。
5. 安卓 Chrome 可在浏览器菜单选择“安装应用 / 添加到主屏幕”；Windows Chrome 或 Edge 可点击地址栏中的安装图标。

构建时会把仓库名作为路由和静态资源前缀，并生成 `404.html`，因此部署到 GitHub 仓库子路径后，刷新 `/stats` 等页面也能回到应用。
如果仓库名本身是 `你的用户名.github.io`，工作流会自动改用网站根路径。

## 以后如何更新

修改并确认功能后执行：

```bash
git add .
git commit -m "描述这次更新"
git push
```

推送到 `main` 后，GitHub Actions 会自动检查、构建并发布。已经安装的刻度会在发现新 Service Worker 后显示“新版本已经准备好”；用户点击“立即更新”才会重载，避免正在计时时被强制打断。

如果更改 GitHub 用户名、仓库名或自定义域名，网站地址会变化，浏览器会把它视为另一个应用。变更前先导出 JSON，访问新地址后再导入。
