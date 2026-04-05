# revu-vscode

## Build & Install

```sh
npm run build          # esbuild → dist/extension.js
npm run typecheck      # tsc --noEmit
npm run install-ext    # build + package + install in VSCode
npm run release:patch  # bump patch, commit, tag, push
npm run release:minor  # same for minor
npm run release:major  # same for major
npm run marketplace    # build + package + open publisher page
```

Always verify the compiled output after editing: grep `dist/extension.js` for the key change before committing.

## Architecture

- **Runtime**: VSCode extension host — Node.js, not Bun. Use npm, not bun.
- **Bundler**: esbuild, CJS output (`--format=cjs`), `vscode` is external.
- **Entry**: `src/extension.ts` → `dist/extension.js`
- **No native modules** — a single `.vsix` works on all platforms (no per-platform builds needed).

## `.revu.json` Format

Shared with `revu-cli`. Both tools read and write the same file at workspace root.

```json
{
  "prompt": "Code review — inline annotations per file and line...",
  "comments": [
    {
      "file": "src/foo.ts",
      "startLine": 5,
      "endLine": 5,
      "text": "Use verifyPassword here — it's timing-safe."
    }
  ]
}
```

- `prompt` — optional; persisted across sessions; defaults to `DEFAULT_PROMPT` in `extension.ts`
- `file` — relative path from workspace root
- `startLine` / `endLine` — 0-indexed line numbers
- `text` — annotation body (Markdown)

The extension also loads legacy flat-array format for backwards compatibility.

## Key Conventions

- `trackThread(thread)` — single entry point for registering any new thread; handles `saveToDisk`, `refresh`, and collapse of prior threads.
- `buildPayload()` — uses `savedPrompt` (in-memory, persisted to `.revu.json`).
- `saveToDisk()` is called on every add and delete — no manual save needed.
- Export file: `revu-review.md` (no leading dot, visible in file tree).
- Storage file: `.revu.json` (leading dot, hidden by default — shared with revu-cli).
