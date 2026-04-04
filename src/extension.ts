import * as vscode from "vscode"

const CONTROLLER_ID = "revu"
const CONTROLLER_LABEL = "revu"

let controller: vscode.CommentController
let statusBar: vscode.StatusBarItem
let notesProvider: RevuNotesProvider
const threads: vscode.CommentThread[] = []

export const activate = (context: vscode.ExtensionContext) => {
  controller = vscode.comments.createCommentController(
    CONTROLLER_ID,
    CONTROLLER_LABEL,
  )
  controller.commentingRangeProvider = {
    provideCommentingRanges: (document) => [
      new vscode.Range(0, 0, document.lineCount - 1, 0),
    ],
  }

  statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  )
  statusBar.command = "revu.exportReview"

  notesProvider = new RevuNotesProvider()

  context.subscriptions.push(
    controller,
    statusBar,
    vscode.window.registerTreeDataProvider("revu.notes", notesProvider),
    vscode.commands.registerCommand("revu.addComment", addComment),
    vscode.commands.registerCommand("revu.exportReview", exportReview),
    vscode.commands.registerCommand("revu.clearComments", clearComments),
    vscode.commands.registerCommand("revu.goToNote", goToNote),
  )

  refresh()
}

const addComment = () => {
  const editor = vscode.window.activeTextEditor
  if (!editor) return

  const line = editor.selection.active.line
  const range = new vscode.Range(line, 0, line, 0)
  const thread = controller.createCommentThread(editor.document.uri, range, [])
  thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded
  thread.canReply = false

  const originalDispose = thread.dispose.bind(thread)
  thread.dispose = () => {
    threads.splice(threads.indexOf(thread), 1)
    originalDispose()
    refresh()
  }

  threads.push(thread)
  refresh()

  vscode.commands.executeCommand("workbench.action.addComment")
}

const exportReview = async () => {
  if (threads.length === 0) {
    vscode.window.showInformationMessage("revu: no comments to export.")
    return
  }

  const markdown = renderMarkdown(threads)

  const choice = await vscode.window.showQuickPick(
    [
      { label: "$(clippy) Copy to clipboard", id: "clipboard" },
      { label: "$(comment-discussion) Send to Copilot Chat", id: "copilot" },
      { label: "$(file) Save as .revu-review.md", id: "file" },
    ],
    { title: "Export review as…" },
  )

  if (!choice) return

  if (choice.id === "clipboard") {
    await vscode.env.clipboard.writeText(markdown)
    vscode.window.showInformationMessage("revu: review copied to clipboard.")
  } else if (choice.id === "copilot") {
    await vscode.env.clipboard.writeText(markdown)
    vscode.commands.executeCommand("workbench.action.chat.open", {
      query: markdown,
    })
  } else if (choice.id === "file") {
    const folders = vscode.workspace.workspaceFolders
    if (!folders) return
    const uri = vscode.Uri.joinPath(folders[0].uri, ".revu-review.md")
    await vscode.workspace.fs.writeFile(uri, Buffer.from(markdown))
    vscode.window.showTextDocument(uri)
  }
}

const clearComments = () => {
  ;[...threads].forEach((t) => t.dispose())
  vscode.window.showInformationMessage("revu: all comments cleared.")
}

const goToNote = (item: NoteItem) => {
  vscode.window.showTextDocument(item.thread.uri, {
    selection: item.thread.range,
  })
}

const refresh = () => {
  notesProvider.refresh()
  updateStatusBar()
}

const updateStatusBar = () => {
  const count = threads.length
  if (count === 0) {
    statusBar.hide()
    return
  }
  statusBar.text = `$(comment) ${count} revu note${count === 1 ? "" : "s"}`
  statusBar.tooltip = "revu: click to export review"
  statusBar.show()
}

const renderMarkdown = (commentThreads: vscode.CommentThread[]): string => {
  const byFile = new Map<string, { line: number; body: string }[]>()

  for (const thread of commentThreads) {
    const file = vscode.workspace.asRelativePath(thread.uri)
    if (!byFile.has(file)) byFile.set(file, [])
    for (const comment of thread.comments) {
      const body =
        comment.body instanceof vscode.MarkdownString
          ? comment.body.value
          : comment.body
      byFile
        .get(file)!
        .push({ line: (thread.range?.start.line ?? 0) + 1, body })
    }
  }

  return Array.from(byFile.entries())
    .map(([file, comments]) => {
      const lines = comments.map(
        ({ line, body }) => `- **line ${line}** — ${body}`,
      )
      return `## ${file}\n\n${lines.join("\n")}`
    })
    .join("\n\n")
}

class RevuNotesProvider implements vscode.TreeDataProvider<NoteItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  refresh() {
    this._onDidChangeTreeData.fire()
  }

  getTreeItem(element: NoteItem) {
    return element
  }

  getChildren(): NoteItem[] {
    return threads.map((thread) => new NoteItem(thread))
  }
}

class NoteItem extends vscode.TreeItem {
  constructor(public readonly thread: vscode.CommentThread) {
    const file = vscode.workspace.asRelativePath(thread.uri)
    const line = (thread.range?.start.line ?? 0) + 1
    const firstComment = thread.comments[0]
    const preview = firstComment
      ? (firstComment.body instanceof vscode.MarkdownString
          ? firstComment.body.value
          : firstComment.body
        ).slice(0, 60)
      : "…"

    super(`${file}:${line}`, vscode.TreeItemCollapsibleState.None)
    this.description = preview
    this.tooltip = preview
    this.iconPath = new vscode.ThemeIcon("comment")
    this.command = {
      command: "revu.goToNote",
      title: "Go to note",
      arguments: [this],
    }
  }
}

export const deactivate = () => {}
