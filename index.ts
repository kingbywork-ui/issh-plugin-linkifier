import type { BufferCellPosition, IsshPlugin, IsshPluginContext, IsshPluginManifest, TerminalDecoratorDefinition, TerminalLink } from './src/types'

export const manifest: IsshPluginManifest = {
    id: 'issh-plugin-linkifier',
    name: '链接识别',
    version: '0.1.2',
    description: '终端输出中的 URL / IP / 文件路径识别，Ctrl+点击 在浏览器打开或复制',
    kind: 'feature',
    entry: 'index.js',
    permissions: ['terminal:decorate'],
    author: 'kingbywork-ui',
    homepage: 'https://github.com/kingbywork-ui/issh-plugin-linkifier',
    repository: 'https://github.com/kingbywork-ui/issh-plugin-linkifier',
    gatewayApiVersion: '1',
    capabilities: ['terminal.decorate'],
}

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s\x00-\x1f"<>\\]+[^\s\x00-\x1f"<>.,:;\\!?)]/gi
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g
const UNIX_PATH_RE = /(?:^|\s)((?:\/(?:home|etc|var|usr|opt|tmp|root|srv|mnt|data|www)\/)[^\s\x00-\x1f"<>|]+)/g

interface LinkMatch {
    text: string
    index: number
    kind: 'url' | 'ip' | 'path'
}

function collectMatches (text: string): LinkMatch[] {
    const results: LinkMatch[] = []
    const add = (match: LinkMatch) => {
        if (!results.some((other) => match.index < other.index + other.text.length && other.index < match.index + match.text.length)) {
            results.push(match)
        }
    }
    // Prefer complete URLs/paths over an IP contained inside either of them.
    for (const match of text.matchAll(URL_RE)) {
        add({ text: match[0], index: match.index!, kind: 'url' })
    }
    for (const match of text.matchAll(UNIX_PATH_RE)) {
        add({ text: match[1], index: match.index! + match[0].length - match[1].length, kind: 'path' })
    }
    for (const match of text.matchAll(IPV4_RE)) {
        if (match[0].split('.').every((octet) => Number(octet) <= 255)) {
            add({ text: match[0], index: match.index!, kind: 'ip' })
        }
    }
    return results.sort((a, b) => a.index - b.index)
}

const decorator: TerminalDecoratorDefinition = {
    id: 'linkifier',
    decorate (options) {
        const { terminal } = options
        const provider = terminal.registerLinkProvider({
            provideLinks (bufferLineNumber, callback) {
                const buffer = terminal.buffer.active
                const requestedRow = bufferLineNumber - 1
                if (!Number.isInteger(requestedRow) || !buffer.getLine(requestedRow)) {
                    callback([])
                    return
                }

                // isWrapped means continuation FROM the previous physical row.
                // Rebuild from the current buffer on every request (also after reflow).
                let firstRow = requestedRow
                let lastRow = requestedRow
                while (firstRow > 0 && buffer.getLine(firstRow)?.isWrapped) firstRow--
                while (lastRow + 1 < buffer.length && buffer.getLine(lastRow + 1)?.isWrapped) lastRow++

                let text = ''
                const cells: Array<{ start: BufferCellPosition; end: BufferCellPosition }> = []
                const reusableCell = buffer.getNullCell()
                for (let y = firstRow; y <= lastRow; y++) {
                    const line = buffer.getLine(y)!
                    const columns = Math.min(terminal.cols, line.length)
                    // A wide glyph wrapping early leaves one empty width-1 cell at
                    // the previous row's end. It is padding, not a space in the URL.
                    const nextStartsWide = y < lastRow && buffer.getLine(y + 1)?.getCell(0)?.getWidth() === 2
                    for (let x = 0; x < columns; x++) {
                        const cell = line.getCell(x, reusableCell)
                        if (!cell || cell.getWidth() === 0) continue // wide-glyph placeholder
                        const chars = cell.getChars()
                        if (!chars && x === terminal.cols - 1 && nextStartsWide) continue
                        const value = chars || ' ' // preserve real spaces and empty interior cells
                        const position = {
                            start: { x: x + 1, y: y + 1 },
                            end: { x: Math.min(x + cell.getWidth(), columns), y: y + 1 },
                        }
                        text += value
                        // Regex offsets are UTF-16, not terminal columns. All code
                        // units of a surrogate/combined cell map to that same glyph.
                        for (let i = 0; i < value.length; i++) cells.push(position)
                    }
                }

                const links: TerminalLink[] = []
                for (const match of collectMatches(text)) {
                    const range = {
                        start: cells[match.index].start,
                        end: cells[match.index + match.text.length - 1].end,
                    }
                    if (range.start.y > bufferLineNumber || range.end.y < bufferLineNumber) continue
                    links.push({
                        text: match.text,
                        range,
                        activate (event) {
                            if (!event.ctrlKey && !event.metaKey) return
                            if (match.kind === 'url') {
                                const url = /^https?:\/\//i.test(match.text) ? match.text : `https://${match.text}`
                                void window.open(url, '_blank', 'noopener,noreferrer')
                            } else {
                                void navigator.clipboard.writeText(match.text)
                            }
                        },
                    })
                }
                callback(links)
            },
        })
        options.dispose(() => { provider.dispose() })
    },
}

const plugin: IsshPlugin = {
    manifest,
    activate (ctx: IsshPluginContext) {
        ctx.gateway.ui.registerTerminalDecorator(decorator)
        ctx.gateway.log('info', 'linkifier plugin activated')
    },
}

export default plugin
