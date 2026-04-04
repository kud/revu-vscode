import * as vscode from "vscode"

const CONTROLLER_ID = "revu"
const CONTROLLER_LABEL = "revu"

const AI_EXTENSIONS = [
  {
    id: "anthropic.claude-code",
    label: "$(anthropic) Send to Claude Code",
    action: "claude",
  },
  {
    id: "GitHub.copilot-chat",
    label: "$(comment-discussion) Send to Copilot Chat",
    action: "copilot",
  },
  {
    id: "Continue.continue",
    label: "$(hubot) Send to Continue",
    action: "continue",
  },
]

const isInstalled = (id: string) => !!vscode.extensions.getExtension(id)

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
    vscode.commands.registerCommand("revu.createNote", createNote),
    vscode.commands.registerCommand("revu.copyToClipboard", copyToClipboard),
    vscode.commands.registerCommand("revu.exportReview", exportReview),
    vscode.commands.registerCommand("revu.clearComments", clearComments),
    vscode.commands.registerCommand("revu.goToNote", goToNote),
  )

  refresh()
}

const addComment = () => {
  const editor = vscode.window.activeTextEditor
  if (!editor) return
  const { start, end } = editor.selection
  const range = new vscode.Range(start.line, 0, end.line, 0)
  const thread = controller.createCommentThread(editor.document.uri, range, [])
  thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded
  thread.canReply = false
  vscode.commands.executeCommand("workbench.action.addComment")
}

const createNote = (reply: vscode.CommentReply) => {
  const comment: vscode.Comment = {
    body: new vscode.MarkdownString(reply.text),
    mode: vscode.CommentMode.Preview,
    author: { name: "{revu}" },
  }
  reply.thread.comments = [comment]
  reply.thread.collapsibleState = vscode.CommentThreadCollapsibleState.Collapsed
  reply.thread.canReply = false

  const thread = reply.thread
  const originalDispose = thread.dispose.bind(thread)
  thread.dispose = () => {
    threads.splice(threads.indexOf(thread), 1)
    originalDispose()
    refresh()
  }

  threads.push(thread)
  refresh()
}

const askPrompt = async (): Promise<string | undefined> => {
  return vscode.window.showInputBox({
    prompt: "What should the AI do with this review?",
    placeHolder: "e.g. Fix these issues, explain your choices…",
    value: "Please review and fix the following annotations:",
  })
}

const buildPayload = (prompt: string) =>
  `${prompt}\n\n${renderMarkdown(threads)}`

const copyToClipboard = async () => {
  if (threads.length === 0) {
    vscode.window.showInformationMessage("revu: no annotations to copy.")
    return
  }
  const prompt = await askPrompt()
  if (prompt === undefined) return
  await vscode.env.clipboard.writeText(buildPayload(prompt))
  vscode.window.showInformationMessage("revu: review copied to clipboard.")
}

const exportReview = async () => {
  if (threads.length === 0) {
    vscode.window.showInformationMessage("revu: no annotations to export.")
    return
  }

  const aiOptions = AI_EXTENSIONS.filter((e) => isInstalled(e.id)).map((e) => ({
    label: e.label,
    id: e.action,
  }))

  const choice = await vscode.window.showQuickPick(
    [
      ...aiOptions,
      { label: "$(globe) Send to ChatGPT", id: "chatgpt" },
      { label: "$(terminal) Send to opencode", id: "opencode" },
      { label: "$(clippy) Copy to clipboard", id: "clipboard" },
      { label: "$(file) Export as Markdown", id: "file" },
    ],
    { title: "Send review to…" },
  )

  if (!choice) return

  const prompt = await askPrompt()
  if (prompt === undefined) return

  const payload = buildPayload(prompt)

  if (choice.id === "claude") {
    await vscode.commands.executeCommand("claude-vscode.sidebar.open")
    await vscode.commands.executeCommand(
      "claude-vscode.insertAtMention",
      payload,
    )
  } else if (choice.id === "copilot") {
    vscode.commands.executeCommand("workbench.action.chat.open", {
      query: payload,
    })
  } else if (choice.id === "continue") {
    vscode.commands.executeCommand("continue.acceptDiff", payload)
  } else if (choice.id === "chatgpt") {
    await vscode.env.clipboard.writeText(payload)
    vscode.env.openExternal(vscode.Uri.parse("https://chat.openai.com"))
    vscode.window.showInformationMessage(
      "revu: review copied — paste it in ChatGPT.",
    )
  } else if (choice.id === "opencode") {
    const terminal = vscode.window.createTerminal("revu → opencode")
    terminal.show()
    terminal.sendText(`opencode << 'REVU'\n${payload}\nREVU`)
  } else if (choice.id === "clipboard") {
    await vscode.env.clipboard.writeText(payload)
    vscode.window.showInformationMessage("revu: review copied to clipboard.")
  } else if (choice.id === "file") {
    const folders = vscode.workspace.workspaceFolders
    if (!folders) return
    const uri = vscode.Uri.joinPath(folders[0].uri, ".revu-review.md")
    await vscode.workspace.fs.writeFile(uri, Buffer.from(payload))
    vscode.window.showTextDocument(uri)
  }
}

const clearComments = () => {
  ;[...threads].forEach((t) => t.dispose())
  vscode.window.showInformationMessage("revu: all annotations cleared.")
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
