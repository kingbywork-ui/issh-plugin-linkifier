export interface IsshPluginManifest {
    id: string
    name: string
    version: string
    description: string
    kind: 'feature' | 'appearance' | 'integration'
    minAppVersion?: string
    entry: string
    permissions?: string[]
    author?: string
    homepage?: string
    repository?: string
    gatewayApiVersion?: string
    capabilities?: string[]
}

export interface SettingsTabDefinition {
    id: string
    title: string
    order?: number
    component: unknown
}

export interface PluginStorage {
    get (key: string): string | null
    set (key: string, value: string): void
    delete (key: string): void
    keys (): string[]
}

// Structural subset of xterm 5.4's public API; no runtime dependency on the host.
export interface BufferCellPosition {
    x: number
    y: number
}

export interface TerminalLink {
    text: string
    // Absolute buffer coordinates, 1-based with an inclusive end.
    range: { start: BufferCellPosition; end: BufferCellPosition }
    activate (event: MouseEvent, text: string): void
}

interface BufferCell {
    getChars (): string
    getWidth (): number
}

interface BufferLine {
    readonly isWrapped: boolean
    readonly length: number
    getCell (x: number, cell?: BufferCell): BufferCell | undefined
}

export interface TerminalDecoratorDefinition {
    id: string
    decorate (options: {
        terminal: {
            readonly cols: number
            buffer: { readonly active: {
                readonly length: number
                getLine (y: number): BufferLine | undefined
                getNullCell (): BufferCell
            } }
            registerLinkProvider (provider: {
                provideLinks (bufferLineNumber: number, callback: (links: TerminalLink[] | undefined) => void): void
            }): { dispose (): void }
        }
        dispose (callback: () => void): void
    }): void
}

export interface IsshPluginContext {
    manifest: IsshPluginManifest
    gateway: { ui: { registerTerminalDecorator (decorator: TerminalDecoratorDefinition): () => void }; log (level: 'info' | 'warn' | 'error', message: string): void }
    registerSettingsTab (tab: SettingsTabDefinition): void
    registerHomeCard (card: { id: string; title: string; order?: number; component: unknown }): void
    registerPanel (panel: { id: string; title: string; placement: 'left' | 'bottom'; component: unknown }): void
    registerTerminalDecorator (decorator: { id: string; decorate (options: { sessionId: string; kind: 'local' | 'ssh'; title: string }): void | Promise<void> }): void
    storage: PluginStorage
    log (level: 'info' | 'warn' | 'error', message: string): void
}

export interface IsshPlugin {
    manifest: IsshPluginManifest
    activate (ctx: IsshPluginContext): void | Promise<void>
}
