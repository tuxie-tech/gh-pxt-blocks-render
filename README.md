# PXT Blocks Render

Renders blocks and TypeScript images from annotated regions of a MakeCode
extension's `tests.ts`, using the real micro:bit editor, so output matches
what users see. The extension the action runs in is added automatically.

## Annotate

```ts
// @render show-number
basic.showNumber(1)
// @endrender
```

Names are stable file names: lowercase `a-z 0-9 - _`, unique per file. Each
region produces:

- `rendered/show-number-blocks.png`
- `rendered/show-number-typescript.png`

The `-python` suffix is reserved (not rendered yet), so names may not end in
`-blocks`, `-typescript` or `-python`.

## Every block, automatically

With `all-blocks: true` (the default) the action also renders one image per
block the extension provides, into `<output-dir>/blocks/<function>-blocks.png`
(e.g. `rendered/blocks/playEffect-blocks.png`). No TypeScript image is made for
these. The list comes from pxt's own API info for blocks whose `pkg` is this
extension and that have a `blockId`. Hidden and deprecated blocks, and blocks
that need an instance (class methods), are skipped with a warning. Parameters
use their `defl`, or `0`/`""`/`false`/first enum member. Value blocks are shown
as `set result to <block>`. Two blocks with the same function name fail the run.

## Use

```yaml
- uses: actions/checkout@v4
- uses: TuxieTech/gh-pxt-blocks-render@main
  with:
    files: |
      tests.ts
      docs/examples.ts
    output-dir: rendered
```

| Input | Default | |
| --- | --- | --- |
| `files` | `tests.ts` | Files to read annotations from (one per line or comma separated; no globs). Names must be unique across all files |
| `output-dir` | `rendered` | Output directory |
| `all-blocks` | `true` | Also render every provided block into `<output-dir>/blocks/` |
| `editor-url` | `https://makecode.microbit.org` | Pin a versioned URL for reproducible renders |
| `extension` | `<pxt.json name>=github:<repo>#<sha>` | Override dependency string |

Output `rendered-files`: JSON array of written paths.

## Rendering on tags only

Images only need to exist for released versions, so render when a tag is pushed
and commit them back (at "tag + 1"). See
[examples/render-on-tag.yml](examples/render-on-tag.yml). Points to know:

- A tag checkout is a detached HEAD, so the workflow renders into
  `runner.temp`, switches to the default branch and commits there. The tag is
  never moved, and renders come from the tagged commit.
- **No CI loop.** Pushes made with the built-in `GITHUB_TOKEN` do not trigger
  workflows, and the commit message carries `[skip ci]` in case a PAT or app
  token is used (those *do* trigger runs). Because it pushes to a branch, the
  `tags:` trigger cannot fire again either.
- If your other workflows run on branch pushes and you use a PAT, also add
  `paths-ignore: ['rendered/**']` to them.
- Branch protection that blocks pushes to the default branch will block the
  bot; allow `github-actions[bot]` or use a PAT/app token with bypass.
- Keep `rendered/` out of `pxt.json` `files`; MakeCode doesn't need it.
- Pin the action to a commit SHA if you want reproducible renders.

## How rendering works

Headless Chromium (playwright-core) opens the micro:bit site's `/--docs`
runner and calls pxt's own `pxt.runner.decompileSnippetAsync`, so blocks use
the target's real block definitions and theme. TypeScript is syntax
highlighted (VS light) in a separate page.

## Status

Annotation parsing has unit tests. Rendering has been run locally against
tuxie-tech/pxt-haptibit and produces correct blocks. It has not yet run inside
a real GitHub Actions job (the composite `action.yml` install steps).
