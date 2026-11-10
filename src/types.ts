// 插件侧类型已收敛为 Gateway SDK 的 type-only re-export：插件不安装依赖，
// 按目录深度（src → 插件目录 → plugins → 仓库根）相对引用 SDK 类型。
// 原 xterm 5.4 结构子集（BufferCellPosition、TerminalLink、装饰器内联的
// terminal/buffer 形状）与 SDK 的 TerminalBufferCellPosition、TerminalLink、
// Terminal/TerminalBuffer/TerminalBufferLine/TerminalBufferCell 同名或同形状，
// 统一改用 SDK；BufferCellPosition 保留原名作为别名出口，index.ts 导入不变。
// 旧 SettingsTabDefinition（component 必填的 unknown 变体）无任何引用，直接删除。
export type {
    IsshPlugin,
    IsshPluginContext,
    IsshPluginManifest,
    PluginStorage,
    TerminalBufferCellPosition as BufferCellPosition,
    TerminalDecoratorDefinition,
    TerminalLink,
} from '../../../packages/issh-gateway/src/types'
