const test = require('node:test');
const assert = require('node:assert');
const { parseAnnotations } = require('../src/annotations');

test('parses named regions', () => {
  const r = parseAnnotations('x()\n// @render a-1\nbasic.showNumber(1)\n// @endrender\n');
  assert.deepStrictEqual(r, [{ name: 'a-1', line: 2, code: 'basic.showNumber(1)' }]);
});
test('rejects duplicates', () => {
  assert.throws(() => parseAnnotations('// @render a\nx()\n// @endrender\n// @render a\ny()\n// @endrender'), /duplicate/);
});
test('rejects reserved suffix', () => {
  assert.throws(() => parseAnnotations('// @render a-python\nx()\n// @endrender'), /reserved/);
});
test('rejects unclosed, nested, empty, bad names', () => {
  assert.throws(() => parseAnnotations('// @render a\nx()'), /never closed/);
  assert.throws(() => parseAnnotations('// @render a\n// @render b\n'), /unclosed/);
  assert.throws(() => parseAnnotations('// @render a\n// @endrender'), /empty/);
  assert.throws(() => parseAnnotations('// @render Bad Name\nx()\n// @endrender'), /invalid/);
  assert.throws(() => parseAnnotations('// @endrender'), /without/);
});
