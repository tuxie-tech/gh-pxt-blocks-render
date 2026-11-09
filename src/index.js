'use strict';
const core = require('@actions/core');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { parseAnnotations } = require('./annotations');
const { renderTypescript, openRunner, renderBlocks, listExtensionBlocks } = require('./render');

function dependencyFor(workspace, override) {
  if (override) return override;
  // The extension this action runs in, pinned to the commit under test.
  const pxt = JSON.parse(fs.readFileSync(path.join(workspace, 'pxt.json'), 'utf8'));
  const repo = process.env.GITHUB_REPOSITORY;
  const sha = process.env.GITHUB_SHA;
  if (!repo || !sha) throw new Error('GITHUB_REPOSITORY/GITHUB_SHA not set; pass the "extension" input instead');
  return `${pxt.name}=github:${repo}#${sha}`;
}

async function run() {
  try {
    const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
    const files = core.getInput('files').split(/[\n,]/).map((f) => f.trim()).filter(Boolean);
    if (!files.length) throw new Error('"files" input is empty');
    const outDir = path.resolve(workspace, core.getInput('output-dir'));
    const editorUrl = core.getInput('editor-url');
    const dependency = dependencyFor(workspace, core.getInput('extension'));

    const regions = [];
    const owner = new Map();
    for (const f of files) {
      const abs = path.resolve(workspace, f);
      if (!fs.existsSync(abs)) throw new Error(`file not found: ${f}`);
      for (const r of parseAnnotations(fs.readFileSync(abs, 'utf8'), f)) {
        if (owner.has(r.name)) throw new Error(`${f}:${r.line}: duplicate render name "${r.name}" (also in ${owner.get(r.name)})`);
        owner.set(r.name, `${f}:${r.line}`);
        regions.push({ ...r, file: f });
      }
    }
    core.info(`Found ${regions.length} @render region(s) in ${files.length} file(s)`);
    fs.mkdirSync(outDir, { recursive: true });

    const browser = await chromium.launch();
    const written = [];
    try {
      const runner = await openRunner(browser, { editorUrl, dependency });
      for (const r of regions) {
        const blocksOut = path.join(outDir, `${r.name}-blocks.png`);
        const tsOut = path.join(outDir, `${r.name}-typescript.png`);
        try {
          await renderBlocks(runner, r.code, blocksOut);
          await renderTypescript(browser, r.code, tsOut);
        } catch (e) {
          throw new Error(`render "${r.name}" (${r.file}:${r.line}): ${e.message}`);
        }
        written.push(blocksOut, tsOut);
        core.info(`Rendered ${r.name}`);
      }

      if (core.getBooleanInput('all-blocks')) {
        const extName = JSON.parse(fs.readFileSync(path.join(workspace, 'pxt.json'), 'utf8')).name;
        const { blocks, skipped } = await listExtensionBlocks(runner, extName);
        const names = new Set();
        for (const b of blocks) {
          if (names.has(b.name)) throw new Error(`two blocks share the function name "${b.name}" (${b.qName}); cannot name renders uniquely`);
          names.add(b.name);
        }
        const blocksDir = path.join(outDir, 'blocks');
        fs.mkdirSync(blocksDir, { recursive: true });
        for (const b of blocks) {
          const out = path.join(blocksDir, `${b.name}-blocks.png`);
          try {
            await renderBlocks(runner, b.code, out, b.blockId);
          } catch (e) {
            throw new Error(`block ${b.qName}: ${e.message}`);
          }
          written.push(out);
          core.info(`Rendered block ${b.qName}`);
        }
        for (const m of skipped) core.warning(`skipped ${m}`);
      }
    } finally {
      await browser.close();
    }
    core.setOutput('rendered-files', JSON.stringify(written));
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

run();
