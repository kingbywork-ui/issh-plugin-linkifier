# issh-plugin-linkifier

issh 桌面客户端（Tauri 版）的链接识别插件。

## 功能

- URL 识别（http/https/www），Ctrl+点击（或 Meta+点击）调用浏览器打开
- IPv4 地址与 Unix 文件路径识别，Ctrl+点击（或 Meta+点击）复制到剪贴板；普通点击不执行动作
- 支持同一链接重复出现、中文/emoji/组合字符，以及跨多个终端软换行的完整链接；不跨硬换行拼接
- 同行 URL 不会屏蔽独立 IP；重叠时优先完整 URL、其次路径、最后 IP，IPv4 每段须在 0–255 范围内

基于 xterm.js `registerLinkProvider`，从当前终端 buffer 的 cell 构造文本与坐标映射，不修改输出或向会话发送数据。链接范围使用 1-based、两端 inclusive 的绝对 buffer 坐标；滚动不叠加 viewport 偏移，尺寸重排后重新读取 buffer。宽字符占位 cell 不计入文本，内部空白与软换行末尾的真实空格保留。

识别仍沿用原有规则：URL 前缀为 http/https/www，Unix 路径限 `/home/`、`/etc/`、`/var/`、`/usr/`、`/opt/`、`/tmp/`、`/root/`、`/srv/`、`/mnt/`、`/data/`、`/www/`；不支持包含空格的路径。

## 开发

```bash
npm install
npm run build
npm run package
```

## 本地回归测试（monorepo）

在仓库根目录运行（需根目录已有 TypeScript、`issh-tauri/node_modules` 已有 xterm 5.4；不增加插件依赖）：

```bash
node --test plugins/issh-plugin-linkifier/test/linkifier.test.mjs
```

在插件目录也可运行 `node --test test/linkifier.test.mjs`。测试直接编译当前 `index.ts` 到内存，执行实际插件注册的 provider；同时严格检查插件 TypeScript 及其与真实 xterm 类型的兼容性，不生成 dist 或测试产物。

覆盖普通/重复匹配、中文/emoji（不同 cell 宽度）/组合符、内部空 cell 和真实空格、软/硬换行、多行 URL/IP/路径、重叠和非法 IPv4、scrollback/viewport 滚动/裁剪、resize 重排/残留列、alternate buffer、输出清理、provider 释放，以及 Ctrl/Meta 动作与普通点击守卫。使用实际 xterm 的未挂载 Terminal buffer；仅 viewport 滚动测试调用 5.4 内部滚动入口（未挂载时公开滚动方法无效）。

当前补丁版本为 **0.1.2**。仅使用现有终端装饰接口，`minAppVersion` 保持 `0.0.1`，不要求升级 issh 主程序，也不增加运行时依赖。

这些是 Node buffer/provider 回归，不代替 Windows 客户端中的实际鼠标高亮、点击、默认浏览器和系统剪贴板验收；测试中的打开/复制动作使用桩。本轮已构建并生成本地 `issh-plugin-linkifier-0.1.2.tgz`，尚未发布商城或更新已安装插件。
