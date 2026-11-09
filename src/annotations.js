'use strict';
// Parses render annotations out of a MakeCode tests.ts file.
//
//   // @render basic-plot
//   basic.showNumber(1)
//   // @endrender
//
// Each region produces `<name>-blocks.png` and `<name>-typescript.png`.
// The `-python` suffix is reserved for future use.

const START = /^\s*\/\/\s*@render\s+(.+?)\s*$/;
const END = /^\s*\/\/\s*@endrender\s*$/;
const NAME = /^[a-z0-9][a-z0-9_-]*$/;
const RESERVED_SUFFIXES = ['-blocks', '-typescript', '-python'];

function parseAnnotations(source, file = 'tests.ts') {
  const regions = [];
  const seen = new Set();
  let current = null;

  source.split(/\r?\n/).forEach((line, i) => {
    const lineNo = i + 1;
    const where = `${file}:${lineNo}`;
    const start = START.exec(line);

    if (start) {
      if (current) throw new Error(`${where}: @render "${start[1]}" inside unclosed @render "${current.name}" (line ${current.line})`);
      const name = start[1];
      if (!NAME.test(name)) throw new Error(`${where}: invalid render name "${name}" (use lowercase a-z, 0-9, "-", "_")`);
      const suffix = RESERVED_SUFFIXES.find((s) => name.endsWith(s));
      if (suffix) throw new Error(`${where}: render name "${name}" must not end with reserved suffix "${suffix}"`);
      if (seen.has(name)) throw new Error(`${where}: duplicate render name "${name}"`);
      seen.add(name);
      current = { name, line: lineNo, lines: [] };
    } else if (END.test(line)) {
      if (!current) throw new Error(`${where}: @endrender without @render`);
      regions.push({ name: current.name, line: current.line, code: current.lines.join('\n').trim() });
      current = null;
    } else if (current) {
      current.lines.push(line);
    }
  });

  if (current) throw new Error(`${file}:${current.line}: @render "${current.name}" is never closed`);
  for (const r of regions) if (!r.code) throw new Error(`${file}:${r.line}: @render "${r.name}" is empty`);
  return regions;
}

module.exports = { parseAnnotations };
