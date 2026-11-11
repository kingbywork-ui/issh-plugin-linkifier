# issh-plugin-linkifier

issh 桌面客户端（Tauri 版）的链接识别插件。

## 功能

- URL 识别（`http(s)://`，如 `https://www.example.com`），Ctrl+点击（或 Meta+点击）调用浏览器打开；普通点击不执行动作
- 仅识别完整 URL：裸 IP/版本号（`1.2.3.4`、`10.0.19045.0`）、文件路径（`/etc/passwd`、`C:\...`）以及正文里的 `www.` 字样（如 `foo.www.log`）不再被识别，也不支持无协议的 `www.` 简写
- 支持同一链接重复出现、中文/emoji/组合字符，以及跨多个终端软换行的完整链接；不跨硬换行拼接
- 行尾句读标点（`, . ; ! ?` 等）不计入链接；成对的括号（如 `/wiki/Foo_(bar)`、`/{a}`）保留

基于 xterm.js `registerLinkProvider`，从当前终端 buffer 的 cell 构造文本与坐标映射，不修改输出或向会话发送数据。链接范围使用 1-based、两端 inclusive 的绝对 buffer 坐标；滚动不叠加 viewport 偏移，尺寸重排后重新读取 buffer。宽字符占位 cell 不计入文本，内部空白与软换行末尾的真实空格保留；行尾补白的空 cell 不参与匹配（避免把行末的 `www.` 补成 `www. ` 被当成 URL）。

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

覆盖普通/重复匹配、中文/emoji（不同 cell 宽度）/组合符、内部空 cell 和真实空格、软/硬换行、多行 URL、行尾标点与成对括号、裸 IP/版本号/路径/正文 `www.` 不识别、scrollback/viewport 滚动/裁剪、resize 重排/残留列、alternate buffer、输出清理、provider 释放，以及 Ctrl/Meta 动作与普通点击守卫。使用实际 xterm 的未挂载 Terminal buffer；仅 viewport 滚动测试调用 5.4 内部滚动入口（未挂载时公开滚动方法无效）。

当前补丁版本为 **0.1.3**。仅使用现有终端装饰接口，`minAppVersion` 保持 `0.0.1`，不要求升级 issh 主程序，也不增加运行时依赖。

这些是 Node buffer/provider 回归，不代替 Windows 客户端中的实际鼠标高亮、点击和默认浏览器验收；测试中的打开动作使用桩。`0.1.3` 仅包含本地 `issh-plugin-linkifier-0.1.3.tgz`，尚未发布商城或更新已安装插件。
