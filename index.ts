import type { BufferCellPosition, IsshPlugin, IsshPluginContext, IsshPluginManifest, TerminalDecoratorDefinition, TerminalLink } from './src/types'

export const manifest: IsshPluginManifest = {
    id: 'issh-plugin-linkifier',
    name: '链接识别',
    version: '0.1.3',
    description: '终端输出中的 URL 识别，Ctrl+点击 在浏览器打开',
    kind: 'feature',
    entry: 'index.js',
    permissions: ['terminal:decorate'],
    author: 'kingbywork-ui',
    homepage: 'https://github.com/kingbywork-ui/issh-plugin-linkifier',
    repository: 'https://github.com/kingbywork-ui/issh-plugin-linkifier',
    gatewayApiVersion: '1',
    capabilities: ['terminal.decorate'],
}

// Only real URLs are links: http(s):// plus a non-empty authority. Deliberately
// not matched: bare IPs/version numbers, file paths, and "www." text in prose
// such as file names ("see foo.www.log").
const URL_RE = /(?<![A-Za-z0-9._-])https?:\/\/[^\s\x00-\x1f"<>\\]+/gi

interface LinkMatch {
    text: string
    index: number
}

// Trailing sentence punctuation is not part of the URL. A closing bracket is
// trimmed only when its opener does not appear inside the URL (counting from the
// URL start), so Bash-style "https://a.test/{a}." keeps the balanced pair.
function trimUrlEnd (url: string): string {
    let end = url.length
    while (end > 0) {
        const ch = url[end - 1]
        if ('.,:;!?\'"'.includes(ch)) {
            end--
        } else if (ch === ')' || ch === ']') {
            const open = ch === ')' ? '(' : '['
            const body = url.slice(0, end)
            if (body.split(open).length > body.split(ch).length) break // balanced: this bracket closes it
            end--
        } else {
            break
        }
    }
    return url.slice(0, end)
}

function collectMatches (text: string): LinkMatch[] {
    const results: LinkMatch[] = []
    for (const match of text.matchAll(URL_RE)) {
        const value = trimUrlEnd(match[0])
        // "https://" / "www." alone is not a link.
        if (!/[A-Za-z0-9]/.test(value.replace(/^https?:\/\//i, '').replace(/^www\./i, ''))) continue
        results.push({ text: value, index: match.index! })
    }
    return results
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
                // Row ends are extended to terminal.cols with spaces so an underline
                // can reach the natural end of the row; this blank must not turn
                // "www." before a line break into a matchable "www. ".
                const rightmostContentX: number[] = []
                for (let y = firstRow; y <= lastRow; y++) {
                    const line = buffer.getLine(y)!
                    let contentX = 0
                    for (let x = 0; x < terminal.cols; x++) {
                        const cell = line.getCell(x, reusableCell)
                        if (cell && (cell.getWidth() > 0 && cell.getChars() !== '')) contentX = x
                    }
                    rightmostContentX.push(contentX)
                }
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
                        const value = chars || (x <= rightmostContentX[y - firstRow] ? ' ' : '')
                        const position = {
                            start: { x: x + 1, y: y + 1 },
                            end: { x: Math.min(x + cell.getWidth(), columns), y: y + 1 },
                        }
                        text += value
                        if (!value) continue
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
                            const url = /^https?:\/\//i.test(match.text) ? match.text : `https://${match.text}`
                            void window.open(url, '_blank', 'noopener,noreferrer')
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
