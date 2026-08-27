import type { IsshPlugin, IsshPluginContext, IsshPluginManifest, TerminalDecoratorDefinition } from './src/types'

export const manifest: IsshPluginManifest = {
    id: 'issh-plugin-linkifier',
    name: '链接识别',
    version: '0.1.1',
    description: '终端输出中的 URL / IP / 文件路径识别，Ctrl+点击 在浏览器打开或复制',
    kind: 'feature',
    entry: 'index.js',
    permissions: ['terminal:decorate'],
    author: 'kingbywork-ui',
    homepage: 'https://github.com/kingbywork-ui/issh-plugin-linkifier',
    repository: 'https://github.com/kingbywork-ui/issh-plugin-linkifier',
}

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s\x00-\x1f"<>\\]+[^\s\x00-\x1f"<>.,:;\\!?)]/gi
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g
const UNIX_PATH_RE = /(?:^|\s)((?:\/(?:home|etc|var|usr|opt|tmp|root|srv|mnt|data|www)\/)[^\s\x00-\x1f"<>|]+)/g

interface LinkMatch {
    text: string
    kind: 'url' | 'ip' | 'path'
}

function containsUrl (line: string): boolean {
    // URL_RE 带 g 标志，test 会受 lastIndex 影响；用 search 每次从头匹配
    return line.search(URL_RE) >= 0
}

function collectMatches (line: string): LinkMatch[] {
    const results: LinkMatch[] = []
    for (const match of line.matchAll(URL_RE)) {
        results.push({ text: match[0], kind: 'url' })
    }
    for (const match of line.matchAll(IPV4_RE)) {
        if (!containsUrl(line)) results.push({ text: match[0], kind: 'ip' })
    }
    for (const match of line.matchAll(UNIX_PATH_RE)) {
        results.push({ text: match[1], kind: 'path' })
    }
    return results
}

const decorator: TerminalDecoratorDefinition = {
    id: 'linkifier',
    decorate (options) {
        const { terminal } = options
        const provider = terminal.registerLinkProvider({
            provideLinks (bufferLineNumber, callback) {
                const line = terminal.buffer.active.getLine(bufferLineNumber - 1)
                if (!line) {
                    callback([])
                    return
                }
                const text = line.translateToString(true)
                const links = collectMatches(text).map((match) => {
                    const index = text.indexOf(match.text)
                    if (index < 0) return null
                    const start = line.rangeStart.x + index
                    const end = start + match.text.length
                    return {
                        text: match.text,
                        range: { start: { x: start, y: bufferLineNumber - 1 }, end: { x: end, y: bufferLineNumber - 1 } },
                        activate () {
                            if (match.kind === 'url') {
                                const url = match.text.startsWith('http') ? match.text : `https://${match.text}`
                                void window.open(url, '_blank', 'noopener,noreferrer')
                            } else {
                                void navigator.clipboard.writeText(match.text)
                            }
                        },
                    }
                }).filter((link): link is NonNullable<typeof link> => link !== null)
                callback(links)
            },
        })
        options.dispose(() => { provider.dispose() })
    },
}

const plugin: IsshPlugin = {
    manifest,
    activate (ctx: IsshPluginContext) {
        ctx.registerTerminalDecorator(decorator)
        ctx.log('info', 'linkifier plugin activated')
    },
}

export default plugin
