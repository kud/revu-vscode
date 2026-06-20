<div align="center">

<img src="assets/revu-logo.png" width="128" alt="revu icon" />

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![VS Code](https://img.shields.io/badge/VS%20Code-007ACC?style=flat-square&logo=visualstudiocode&logoColor=white)
![MIT](https://img.shields.io/badge/licence-MIT-22C55E?style=flat-square)

**Annotate code, export reviews to AI**

<a href="https://kud.io/projects/revu-vscode">Website</a> · <a href="https://kud.io/projects/revu-vscode/docs">Documentation</a>

</div>

## Features

- **Inline annotations** — select any line or range in the editor and attach a named comment thread directly in the gutter, without leaving VS Code.
- **Persistent storage** — annotations are saved to `.revu.json` in your workspace root and restored automatically on next open.
- **Configurable review prompt** — choose from built-in templates (Code Review, Refactor, Explain) or write a custom prompt that is prepended to every export.
- **Send to Copilot or Claude Code** — export the full annotated review to GitHub Copilot Chat or Claude Code with a single command; the extension opens the chat and pre-fills the prompt.
- **Copy or preview as Markdown** — copy the review to the clipboard, or open a live Markdown preview inside VS Code for a formatted read before sending.
- **Sidebar panel** — browse all annotations grouped by file or in a flat list, with a badge showing the current annotation count.

## Install

Search **revu** in the VS Code Extensions panel, or install from the command line:

```sh
code --install-extension kud.revu-vscode
```

[Open in VS Code Marketplace →](https://marketplace.visualstudio.com/items?itemName=kud.revu-vscode)

## Usage

1. Select one or more lines in the editor.
2. Press `Cmd+Shift+N` (macOS) / `Ctrl+Shift+N` (Windows/Linux), or right-click and choose **revu: Add Annotation**.
3. Type your annotation in the comment thread that appears, then click **Add Annotation** to confirm.
4. Repeat for as many lines as needed — each annotation is listed in the **revu** sidebar panel.
5. When ready to export, open the sidebar and choose an action from the toolbar:
   - **Send to Chat** (`$(send)`) — pick Copilot or Claude Code; the review is sent directly to the chat input.
   - **Copy to Clipboard** (`$(clippy)`) — copies the full prompt-led Markdown review.
   - **Export as Markdown** (`$(markdown)`) — opens a live Markdown preview inside VS Code.
6. Optionally, click **Edit Review Prompt** (`$(sparkle)`) to switch between Code Review, Refactor, Explain, or a custom prompt.

Annotations persist across sessions via `.revu.json` in your workspace root.

## Development

```sh
git clone https://github.com/kud/revu-vscode.git
cd revu-vscode
npm install
npm run watch
```

Press `F5` in VS Code to open an Extension Development Host with revu loaded.

To build and install locally:

```sh
npm run install-ext
```

📚 **Full documentation → [revu-vscode/docs](https://kud.io/projects/revu-vscode/docs)**
