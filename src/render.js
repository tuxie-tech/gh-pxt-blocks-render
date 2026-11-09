'use strict';
const fs = require('node:fs');
const path = require('node:path');
const hljs = require('highlight.js/lib/core');
hljs.registerLanguage('typescript', require('highlight.js/lib/languages/typescript'));
const vsCss = fs.readFileSync(require.resolve('highlight.js/styles/vs.css'), 'utf8');

const SCALE = 2;

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Render TypeScript to `<out>` as a PNG, styled like the (light) MakeCode text editor.
async function renderTypescript(browser, code, out) {
  const page = await browser.newPage({ deviceScaleFactor: SCALE });
  const html = hljs.highlight(code, { language: 'typescript' }).value;
  await page.setContent(`<!doctype html><style>${vsCss}
    body{margin:0;background:#fff}
    #c{display:inline-block;padding:12px 16px;background:#fff}
    pre{margin:0;font:14px/1.5 Menlo,Consolas,'Courier New',monospace;tab-size:4}
    .hljs{background:#fff;padding:0}</style>
    <div id="c"><pre><code class="hljs">${html}</code></pre></div>`);
  await page.locator('#c').screenshot({ path: out });
  await page.close();
}

// Open the real micro:bit target's docs runner, which hosts pxt's own
// renderer (pxt.runner) with the target's block definitions and theme.
async function openRunner(browser, { editorUrl, dependency }) {
  const page = await browser.newPage({ deviceScaleFactor: SCALE, viewport: { width: 1400, height: 1000 } });
  await page.goto(`${editorUrl.replace(/\/$/, '')}/--docs`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.pxt && window.pxt.runner, null, { timeout: 120000 });
  page.dependency = dependency;
  return page;
}

// Decompile `code` to blocks using pxt.runner and screenshot the result.
async function renderBlocks(page, code, out) {
  const ok = await page.evaluate(async ({ code, dependency }) => {
    const res = await pxt.runner.decompileSnippetAsync(code, {
      package: dependency ? dependency : undefined,
      snippetMode: false,
    });
    if (!res || !res.blocksSvg) return { error: 'decompile produced no blocks' + (res && res.compileJS ? '' : ' (code may not compile)') };
    document.body.innerHTML = '';
    const holder = document.createElement('div');
    holder.id = 'pxt-render';
    holder.style.cssText = 'display:inline-block;background:#fff;padding:8px';
    const svg = res.blocksSvg;
    const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
    if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
      svg.setAttribute('width', String(Math.ceil(vb[2])));
      svg.setAttribute('height', String(Math.ceil(vb[3])));
    }
    holder.appendChild(svg);
    document.body.appendChild(holder);
    return {};
  }, { code, dependency: page.dependency });
  if (ok.error) throw new Error(ok.error);
  await page.locator('#pxt-render').screenshot({ path: out });
}

// List the blocks provided by extension `extName` (from pxt's apiInfo) and
// build a minimal snippet for each. Returns { blocks: [{name, qName, code}], skipped: [string] }.
async function listExtensionBlocks(page, extName) {
  return page.evaluate(async ({ extName, dependency }) => {
    const res = await pxt.runner.decompileSnippetAsync('basic.pause(1)', { package: dependency });
    const syms = Object.values(res.apiInfo.byQName);
    const enumFirst = {};
    for (const s of syms) if (s.kind === 7 /* EnumMember */ && s.namespace && !(s.namespace in enumFirst)) enumFirst[s.namespace] = s.qName;

    const FN = 1 /* Method */, PROP = 2, FUNC = 3;
    const blocks = [], skipped = [];
    for (const s of syms) {
      const a = s.attributes || {};
      if (s.pkg !== extName || ![FN, PROP, FUNC].includes(s.kind) || !a.blockId) continue;
      if (a.blockHidden || a.deprecated) { skipped.push(`${s.qName}: hidden or deprecated`); continue; }
      if (s.kind !== FUNC || !s.namespace) { skipped.push(`${s.qName}: not a namespace function (needs an instance)`); continue; }
      const args = (s.parameters || []).map((p) => {
        if (p.default !== undefined && p.default !== null && p.default !== '') return /^(string)$/.test(p.type) && !/^["']/.test(p.default) ? JSON.stringify(p.default) : p.default;
        if (p.type === 'number') return '0';
        if (p.type === 'string') return '""';
        if (p.type === 'boolean') return 'false';
        if (enumFirst[p.type]) return enumFirst[p.type];
        if (/=>|Action|function/.test(p.type || '')) return 'function () {}';
        return null;
      });
      if (args.includes(null)) { skipped.push(`${s.qName}: cannot build a default argument`); continue; }
      const call = `${s.qName}(${args.join(', ')})`;
      const code = s.retType && s.retType !== 'void' ? `let result = ${call}` : call;
      blocks.push({ name: s.name, qName: s.qName, code });
    }
    blocks.sort((x, y) => x.qName.localeCompare(y.qName));
    return { blocks, skipped };
  }, { extName, dependency: page.dependency });
}

module.exports = { renderTypescript, openRunner, renderBlocks, listExtensionBlocks };
