# issh-plugin-linkifier

issh 桌面客户端（Tauri 版）的链接识别插件。

## 功能

- URL 识别（http/https/www），Ctrl+点击 在系统默认浏览器打开
- IPv4 地址与 Unix 文件路径识别，Ctrl+点击 复制到剪贴板

基于 xterm.js `registerLinkProvider`，仅做终端渲染层识别，不读写会话数据。

## 开发

```bash
npm install
npm run build
npm run package
```
