import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

// Use the monorepo's existing tools. No install/build, DOM or generated files.
// The browser Terminal's real buffer works before open(); only the viewport
// scroll test needs its 5.4 core scroll entry point because no DOM is mounted.
const require = createRequire(new URL('../../../package.json', import.meta.url))
const ts = require('typescript')
const { Terminal } = require('./issh-tauri/node_modules/@xterm/xterm/lib/xterm.js')
const sourceFile = fileURLToPath(new URL('../index.ts', import.meta.url))
const compiled = ts.transpileModule(readFileSync(sourceFile, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText
const { default: plugin } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

function fixture (t, options = {}) {
    const terminal = new Terminal({ allowProposedApi: true, cols: 100, rows: 6, scrollback: 100, ...options })
    let provider
    let decorator
    let disposeCount = 0
    let registrationCount = 0
    const cleanups = []
    const logs = []
    plugin.activate({ gateway: {
        ui: { registerTerminalDecorator (value) { decorator = value; registrationCount++ } },
        log (...args) { logs.push(args) },
    } })
    assert.equal(registrationCount, 1)
    assert.equal(decorator.id, 'linkifier')
    decorator.decorate({
        terminal: {
            get cols () { return terminal.cols },
            get buffer () { return terminal.buffer },
            registerLinkProvider (value) {
                provider = value
                const registration = terminal.registerLinkProvider(value)
                return { dispose () { disposeCount++; registration.dispose() } }
            },
        },
        dispose (cleanup) { cleanups.push(cleanup) },
    })
    t.after(() => { for (const cleanup of cleanups.splice(0)) cleanup(); terminal.dispose() })
    return {
        terminal, logs,
        get disposeCount () { return disposeCount },
        cleanup () { for (const cleanup of cleanups.splice(0)) cleanup() },
        write (text) { return new Promise((resolve) => terminal.write(text, resolve)) },
        links (row = 1) {
            let calls = 0
            let result
            provider.provideLinks(row, (links) => { calls++; result = links })
            assert.equal(calls, 1, 'provider responds exactly once')
            return result
        },
    }
}

function range (x1, y1, x2, y2) {
    return { start: { x: x1, y: y1 }, end: { x: x2, y: y2 } }
}

function summaries (links) {
    return links.map(({ text, range }) => ({ text, range }))
}

// Same inclusive hit-test used by xterm 5.4 Linkifier._linkAtPosition.
function hit (link, x, y, cols) {
    const { start, end } = link.range
    return start.y * cols + start.x <= y * cols + x && y * cols + x <= end.y * cols + end.x
}

test('plugin TypeScript is strict-clean and its decorator accepts the real xterm API', () => {
    const compatibilityFile = ts.normalizePath(fileURLToPath(new URL('./xterm-compatibility.ts', import.meta.url)))
    const options = {
        strict: true, noEmit: true, target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
        types: [], skipLibCheck: true, allowJs: true, noCheck: true,
    }
    const host = ts.createCompilerHost(options)
    const getSourceFile = host.getSourceFile.bind(host)
    host.getSourceFile = (name, ...args) => ts.normalizePath(name) === compatibilityFile
        ? ts.createSourceFile(name, `
            import type { Terminal } from '@xterm/xterm'
            import type { TerminalDecoratorDefinition } from '../src/types'
            declare const terminal: Terminal
            declare const decorator: TerminalDecoratorDefinition
            decorator.decorate({
                sessionId: 'fixture',
                kind: 'ssh',
                title: 'fixture',
                profile: null,
                terminal,
                write () {},
                dispose () {},
            })
        `, options.target, true)
        : getSourceFile(name, ...args)
    const xtermTypes = fileURLToPath(new URL('../../../issh-tauri/node_modules/@xterm/xterm/typings/xterm.d.ts', import.meta.url))
    const program = ts.createProgram([sourceFile, compatibilityFile, xtermTypes], options, host)
    const errors = ts.getPreEmitDiagnostics(program)
    assert.equal(errors.length, 0, ts.formatDiagnosticsWithColorAndContext(errors, {
        getCurrentDirectory: () => process.cwd(), getCanonicalFileName: (name) => name, getNewLine: () => '\n',
    }))
})

test('ordinary URL: exact 1-based inclusive endpoints and no hit on adjacent spaces', async (t) => {
    const f = fixture(t)
    await f.write('  https://example.test  ')
    const [link] = f.links()
    assert.equal(link.text, 'https://example.test')
    assert.deepEqual(link.range, range(3, 1, 22, 1))
    assert.equal(hit(link, 2, 1, f.terminal.cols), false)
    assert.equal(hit(link, 3, 1, f.terminal.cols), true)
    assert.equal(hit(link, 22, 1, f.terminal.cols), true)
    assert.equal(hit(link, 23, 1, f.terminal.cols), false)
})

test('repeated URL retains its own regex match position', async (t) => {
    const f = fixture(t)
    const text = 'https://a.test https://a.test'
    await f.write(text)
    const expected = ['https://a.test', 'https://a.test']
    let from = 0
    assert.deepEqual(summaries(f.links()), expected.map((value) => {
        const index = text.indexOf(value, from)
        from = index + value.length
        return { text: value, range: range(index + 1, 1, index + value.length, 1) }
    }))
})

for (const [label, prefix, start] of [
    ['wide Chinese', '中文 ', 6],
    ['emoji surrogate pair', '😀 ', 3], // xterm's default Unicode provider reports this emoji as width 1
    ['combining cell', 'é ', 3],
    ['mixed Unicode', '中😀é ', 6],
    ['literal spaces', '   ', 4],
]) {
    test(`${label} before a URL maps UTF-16 offsets to actual cells`, async (t) => {
        const f = fixture(t)
        await f.write(`${prefix}https://a.test`)
        assert.deepEqual(f.links()[0].range, range(start, 1, start + 'https://a.test'.length - 1, 1))
    })
}

test('Unicode inside URLs includes full wide and combined end cells', async (t) => {
    const f = fixture(t)
    await f.write('https://a.test/中 https://b.test/é https://c.test/😀')
    assert.deepEqual(summaries(f.links()), [
        { text: 'https://a.test/中', range: range(1, 1, 17, 1) },
        { text: 'https://b.test/é', range: range(19, 1, 34, 1) },
        { text: 'https://c.test/😀', range: range(36, 1, 51, 1) },
    ])
})

test('a different Unicode width provider still uses cell-reported emoji widths', async (t) => {
    const f = fixture(t, { cols: 18 })
    // Exercise both widths without adding the unicode11 addon. This provider is
    // only for the ASCII + emoji fixture; production must never guess wcwidth.
    f.terminal.unicode.register({
        version: 'test-wide-emoji',
        wcwidth: (code) => code === 0x1f600 ? 2 : 1,
        charProperties (code) { return this.wcwidth(code) << 1 },
    })
    f.terminal.unicode.activeVersion = 'test-wide-emoji'
    await f.write('😀 https://a.test/😀')
    assert.equal(f.terminal.buffer.active.getLine(0).getCell(0).getWidth(), 2)
    const expected = [{ text: 'https://a.test/😀', range: range(4, 1, 2, 2) }]
    assert.deepEqual(summaries(f.links(1)), expected)
    assert.deepEqual(summaries(f.links(2)), expected)
})

test('empty interior cells are spaces, not removed text', async (t) => {
    const f = fixture(t)
    await f.write('https://a.test\x1b[3Chttps://b.test')
    assert.deepEqual(summaries(f.links()), [
        { text: 'https://a.test', range: range(1, 1, 14, 1) },
        { text: 'https://b.test', range: range(18, 1, 31, 1) },
    ])
})

test('bare IPs, version numbers and file paths are not links', async (t) => {
    const f = fixture(t, { cols: 160 })
    await f.write('1.2.3.4 8.8.8.8 255.255.255.255 10.0.19045.0 192.168.10.20:22 /tmp/a /etc/passwd /usr/local/bin C:\\Windows')
    assert.deepEqual(f.links(), [])
})

test('www text is only a link as part of an http(s) URL', async (t) => {
    const f = fixture(t, { cols: 160 })
    await f.write('see foo.www.log in prose www. and www.example.test')
    assert.deepEqual(f.links(), [])
    await f.write('\r\x1b[2K')
    await f.write('https://www.example.test/a  www.example.test')
    assert.deepEqual(f.links().map((link) => link.text), ['https://www.example.test/a'])
})

test('trailing punctuation is trimmed; balanced brackets inside the URL are kept', async (t) => {
    const f = fixture(t, { cols: 160 })
    await f.write('(https://a.test/x), https://b.test/y. https://c.test/(p) https://d.test/{a}.')
    assert.deepEqual(f.links().map((link) => link.text), [
        'https://a.test/x', 'https://b.test/y', 'https://c.test/(p', 'https://d.test/{a}',
    ])
})

test('complete long URL is provided from every soft-wrapped row, but not unrelated rows', async (t) => {
    const f = fixture(t, { cols: 12 })
    const url = 'https://example.test/abcdefghijklmnop'
    await f.write(`  ${url}  tail tail tail tail`)
    const expected = [{ text: url, range: range(3, 1, 3, 4) }]
    for (const row of [1, 2, 3, 4]) assert.deepEqual(summaries(f.links(row)), expected)
    assert.deepEqual(f.links(5), [])
    const [link] = f.links(2)
    assert.equal(hit(link, 12, 2, 12), true)
    assert.equal(hit(link, 3, 4, 12), true)
    assert.equal(hit(link, 4, 4, 12), false)
})

test('wrapped URL uses the entire match and absolute multi-row endpoints', async (t) => {
    const f = fixture(t, { cols: 10 })
    await f.write('xxxx https://abcdefgh')
    const links = f.links(2)
    assert.deepEqual(summaries(links), [
        { text: 'https://abcdefgh', range: range(6, 1, 1, 3) },
    ])
    assert.deepEqual(summaries(f.links(3)), summaries(links))
    assert.deepEqual(f.links(4), [])
})

test('repeated wrapped URLs keep distinct ranges and only appear on their own rows', async (t) => {
    const f = fixture(t, { cols: 10 })
    await f.write('https://a.test https://a.test')
    const first = { text: 'https://a.test', range: range(1, 1, 4, 2) }
    const second = { text: 'https://a.test', range: range(6, 2, 9, 3) }
    assert.deepEqual(summaries(f.links(1)), [first])
    assert.deepEqual(summaries(f.links(2)), [first, second])
    assert.deepEqual(summaries(f.links(3)), [second])
})

test('wide-character early-wrap padding is omitted, width-zero placeholders are skipped', async (t) => {
    const f = fixture(t, { cols: 10 })
    const url = 'https://a中b.test/中'
    await f.write(url)
    assert.equal(f.terminal.buffer.active.getLine(0).getCell(9).getChars(), '')
    assert.equal(f.terminal.buffer.active.getLine(1).getCell(0).getWidth(), 2)
    const expected = [{ text: url, range: range(1, 1, 2, 3) }]
    for (const row of [1, 2, 3]) assert.deepEqual(summaries(f.links(row)), expected)
})

test('real trailing spaces at a wrap boundary remain URL separators', async (t) => {
    const f = fixture(t, { cols: 15 })
    await f.write('https://a.test 中suffix')
    assert.equal(f.terminal.buffer.active.getLine(0).getCell(14).getChars(), ' ')
    assert.equal(f.terminal.buffer.active.getLine(1).isWrapped, true)
    assert.deepEqual(summaries(f.links(1)), [{ text: 'https://a.test', range: range(1, 1, 14, 1) }])
    assert.deepEqual(f.links(2), [])
})

test('a hard newline is never joined, even when the previous row is exactly full', async (t) => {
    const f = fixture(t, { cols: 14 })
    await f.write('https://a.test\r\n/extra\r\nhttps://\r\na.test')
    assert.equal(f.terminal.buffer.active.getLine(1).isWrapped, false)
    assert.deepEqual(summaries(f.links(1)), [{ text: 'https://a.test', range: range(1, 1, 14, 1) }])
    assert.deepEqual(f.links(2), [])
    assert.deepEqual(f.links(3), [])
    assert.deepEqual(f.links(4), [])
})

test('scrollback and viewport scrolling do not add a second row offset', async (t) => {
    const f = fixture(t, { cols: 20, rows: 3 })
    await f.write('one\r\ntwo\r\nhttps://a.test/abcdefghi\r\nlast\r\n')
    assert.ok(f.terminal.buffer.active.baseY > 0)
    const expected = [{ text: 'https://a.test/abcdefghi', range: range(1, 3, 4, 4) }]
    assert.deepEqual(summaries(f.links(3)), expected)
    assert.deepEqual(summaries(f.links(4)), expected)
    // Public scrollToTop/Bottom delegate to an absent DOM viewport before open().
    // Invoke the real 5.4 viewport callback path (ScrollSource.VIEWPORT = 1).
    f.terminal._core.scrollLines(-f.terminal.buffer.active.baseY, false, 1)
    assert.equal(f.terminal.buffer.active.viewportY, 0)
    assert.deepEqual(summaries(f.links(3)), expected)
    f.terminal._core.scrollLines(f.terminal.buffer.active.baseY, false, 1)
    assert.equal(f.terminal.buffer.active.viewportY, f.terminal.buffer.active.baseY)
    assert.deepEqual(summaries(f.links(4)), expected)
})

test('buffer trimming keeps current absolute rows rather than stale historical coordinates', async (t) => {
    const f = fixture(t, { cols: 20, rows: 3, scrollback: 2 })
    await f.write('old\r\n'.repeat(10) + 'https://a.test\r\nend')
    assert.equal(f.terminal.buffer.active.length, 5)
    assert.deepEqual(summaries(f.links(4)), [{ text: 'https://a.test', range: range(1, 4, 14, 4) }])
    assert.deepEqual(f.links(1), [])
})

test('resize reflow recomputes row and cell coordinates without cached matches', async (t) => {
    const f = fixture(t, { cols: 30, rows: 8 })
    const url = 'https://a.test/abcdefghijklmnop'
    await f.write(`中 ${url}\r\nend`)
    assert.deepEqual(summaries(f.links(2)), [{ text: url, range: range(4, 1, 4, 2) }])
    f.terminal.resize(12, 8)
    const narrow = [{ text: url, range: range(4, 1, 10, 3) }]
    for (const row of [1, 2, 3]) assert.deepEqual(summaries(f.links(row)), narrow)
    f.terminal.resize(50, 8)
    assert.deepEqual(summaries(f.links(1)), [{ text: url, range: range(4, 1, 34, 1) }])
    assert.deepEqual(f.links(2), [])
})

test('requests read the active buffer and current contents, including clear and alternate screen', async (t) => {
    const f = fixture(t)
    await f.write('https://a.test')
    assert.equal(f.links().length, 1)
    await f.write('\x1b[?1049h')
    assert.deepEqual(f.links(), [])
    await f.write('https://b.test')
    assert.equal(f.links()[0].text, 'https://b.test')
    await f.write('\x1b[?1049l')
    assert.equal(f.links()[0].text, 'https://a.test')
    await f.write('\r\x1b[2Kplain')
    assert.deepEqual(f.links(), [])
    f.terminal.clear()
    for (const row of [0, -1, 1.5, 9999, NaN]) assert.deepEqual(f.links(row), [])
})

test('alternate-buffer resize ignores retained cells beyond terminal.cols', async (t) => {
    const f = fixture(t, { cols: 30 })
    await f.write('\x1b[?1049hxxxx https://a.test')
    assert.equal(f.links().length, 1)
    f.terminal.resize(8, 6)
    assert.ok(f.terminal.buffer.active.getLine(0).length > f.terminal.cols)
    assert.deepEqual(f.links(), [])
})

test('decoration owns and disposes its provider', (t) => {
    const f = fixture(t)
    assert.deepEqual(f.logs, [['info', 'linkifier plugin activated']])
    assert.equal(f.disposeCount, 0)
    f.cleanup()
    assert.equal(f.disposeCount, 1)
})

test('only Ctrl/Meta activates: safe browser arguments and www normalization', async (t) => {
    const f = fixture(t, { cols: 12, rows: 12 })
    await f.write('https://a.test HTTP://c.test WWW.b.test 1.2.3.4 /tmp/abcdefghijkl')
    const links = [...new Map(Array.from({ length: 12 }, (_, i) => f.links(i + 1)).flat().map((link) => [link.text, link])).values()]
    // WWW.b.test ends a soft-wrapped row ("www." + a padding cell); it must not be opened.
    assert.deepEqual(summaries(links).map(({ text }) => text), ['https://a.test', 'HTTP://c.test'])
    const opened = []
    const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
    const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { open: (...args) => opened.push(args) } })
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: () => { throw new Error('must not copy') } } } })
    t.after(() => {
        if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else delete globalThis.window
        if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator); else delete globalThis.navigator
    })
    for (const link of links) {
        link.activate({ ctrlKey: false, metaKey: false }, link.text)
        link.activate({ ctrlKey: false, metaKey: false, shiftKey: true, altKey: true }, link.text)
    }
    assert.deepEqual(opened, [])
    for (const modifier of ['ctrlKey', 'metaKey']) {
        for (const link of links) link.activate({ [modifier]: true }, link.text)
    }
    const expectedUrls = ['https://a.test', 'HTTP://c.test']
    assert.deepEqual(opened, [...expectedUrls, ...expectedUrls].map((url) => [url, '_blank', 'noopener,noreferrer']))
})
