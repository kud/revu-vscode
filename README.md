<p align="center">
  <img src="assets/revu-logo.png" width="120" alt="revu logo" />
</p>

# revu for VS Code

**Annotate any line of code. Export your review to Claude, Copilot, ChatGPT, or anywhere.**

Built for the AI-assisted coding workflow — where you review what the AI wrote, annotate what needs fixing, and send it back.

---

## How it works

1. **Select** one or more lines in any file
2. **Annotate** — click the `+` button in the editor title bar or right-click → `revu: Add Annotation`
3. **Type** your note in the discussion box and submit
4. **Export** — open the revu sidebar, click the export button, pick your AI

The review is formatted as Markdown and prefixed with a prompt you write on the spot:

```md
Please fix the following issues:

## src/auth.ts

- **line 12** — use verifyPassword instead of hashPassword, it's timing-safe
- **line 28** — missing rate limiting before this DB call

## src/api.ts

- **line 6** — session ID should come from a signed cookie, not a plain header
```

---

## Features

- **Annotate any line or selection** — inline comment threads, always visible in the gutter
- **Sidebar panel** — all your annotations in one place, click to jump to any line
- **Smart export** — only shows AI tools you actually have installed
- **Prompt-first** — asks what you want the AI to do before sending
- **Export destinations**
  - Claude Code (native integration)
  - GitHub Copilot Chat
  - Continue
  - ChatGPT (opens browser + clipboard)
  - opencode (terminal)
  - Copy to clipboard
  - Save as `.revu-review.md`

---

## Commands

| Command                    | Description                            |
| -------------------------- | -------------------------------------- |
| `revu: Add Annotation`     | Annotate the current line or selection |
| `revu: Export Review`      | Send your review to an AI or export it |
| `revu: Copy to Clipboard`  | Copy the review markdown to clipboard  |
| `revu: Clear All Comments` | Remove all annotations                 |

---

## Install

Search **revu** in the VS Code Extensions panel, or:

```sh
code --install-extension kud.revu-vscode
```

---

## Related

- [revu-cli](https://github.com/kud/revu-cli) — the terminal version (TUI, works over SSH)
