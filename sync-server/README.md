# 刻度局域网同步服务器

这是一个只为个人局域网使用的轻量 HTTPS 服务。它不提供目录浏览，也不是公共云服务，只允许经过账号密码验证的设备读取或覆盖一份刻度 JSON 备份。

## 安全与数据规则

- 仅接受刻度备份格式，单个文件最大 8 MiB。
- 使用 Basic Authentication，因此必须配合 HTTPS。
- 使用 `ETag`、`If-Match` 和 `If-None-Match` 防止设备之间静默覆盖。
- 写入采用临时文件加原子替换；覆盖前保存 `kedu-focus-backup.previous.json`。
- 默认只允许 `https://gup-n.github.io`、本地 Vite 开发地址跨域访问。
- 数据、密码、私钥和证书均被 `.gitignore` 排除，不会上传 GitHub。

## Windows 一键启动（当前推荐）

双击：

```text
start-windows.bat
```

首次运行会请求管理员权限，自动检测 WLAN 地址、生成或更新服务器证书、导入 Windows CA、配置仅限本地子网的 8443 防火墙规则，并创建随机同步密码。保持窗口打开即可持续提供同步。

停止服务请双击：

```text
stop-windows.bat
```

停止脚本通过 `data/kedu-sync.pid` 精确识别本项目的 Python 进程。不要只关闭窗口或在任务管理器中随意结束父 PowerShell；停止脚本会同时确认 PID 文件已移除且 8443 不再监听。

如果启动时提示端口已经占用，先运行 `stop-windows.bat`，再重新运行 `start-windows.bat`。启动窗口会显示当前局域网地址、用户名、密码和需要安装到 Android 的 CA 文件。

## 1. 准备固定局域网地址

建议在路由器中为这台 Windows 电脑设置 DHCP 地址保留，例如 `192.168.1.20`。后续证书与手机中的 WebDAV 地址都使用这个固定 IP。

## 2. 生成个人局域网证书

在 WSL Ubuntu 中运行：

```bash
cd /mnt/f/coding/python/project/TaskPlaning/sync-server
chmod +x create-lan-certificate.sh start-server.sh
./create-lan-certificate.sh 192.168.1.20
```

把生成的 `certs/kedu-ca.crt` 安装到 Windows 和 Android 的受信任 CA。只传输 `.crt`，不要复制 `kedu-ca.key` 或 `server.key`。

## 3. 配置服务

```bash
cp .env.example .env
chmod 600 .env
```

编辑 `.env`：

- 把 `YOUR_USER` 替换为 Ubuntu 用户名。
- 设置一个只用于刻度同步的长密码。
- 保持 `KEDU_SYNC_FILENAME=kedu-focus-backup.json`。
- 证书路径使用当前目录下的 `./certs/server.crt` 和 `./certs/server.key`。

启动：

```bash
./start-server.sh
```

服务默认监听 `0.0.0.0:8443`，数据保存在 `KEDU_SYNC_DATA_DIR`。首次上传前数据文件不存在，这是正常状态。

## 4. 开放局域网访问

Windows 11 + WSL 2 推荐使用镜像网络，并只为 TCP 8443 开放 Hyper-V/Windows 防火墙入站规则。不要在路由器上配置端口转发，也不要向公网开放 8443。

这一步需要管理员权限，执行前应确认当前网络为可信的“专用网络”。

## 5. 在刻度中连接

打开“设置 → 数据管理 → WebDAV 同步”，填写：

- 服务器目录地址：`https://192.168.1.20:8443/`
- 远端文件名：`kedu-focus-backup.json`
- 用户名、密码：与 `.env` 一致

先点击“测试连接”。服务器尚无备份时显示“连接成功，远端目录中还没有刻度备份”；随后点击“立即同步”即可首次上传。

## 6. 自动启动（可选）

`kedu-focus-sync.service.example` 是 systemd 模板。将其中项目路径和 Ubuntu 用户目录替换为真实值后，复制到 `/etc/systemd/system/kedu-focus-sync.service`，再启用：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now kedu-focus-sync
```

电脑关机、休眠或服务停止期间，刻度仍会继续把数据保存在手机和电脑本地；服务器恢复后再手动同步。

## 测试

```bash
python3 -m unittest -v test_server.py
```
