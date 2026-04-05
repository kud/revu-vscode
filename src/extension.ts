import * as vscode from "vscode"

const CONTROLLER_ID = "revu"

type ViewMode = "flat" | "grouped"
const VIEW_MODES: ViewMode[] = ["flat", "grouped"]

let controller: vscode.CommentController
let statusBar: vscode.StatusBarItem
let notesProvider: RevuNotesProvider
let viewMode: ViewMode = "grouped"
let extensionUri: vscode.Uri
const threads: vscode.CommentThread[] = []

export const activate = async (context: vscode.ExtensionContext) => {
  extensionUri = context.extensionUri
  controller = vscode.comments.createCommentController(
    CONTROLLER_ID,
    CONTROLLER_ID,
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
    vscode.commands.registerCommand("revu.exportMarkdown", exportMarkdown),
    vscode.commands.registerCommand("revu.clearComments", clearComments),
    vscode.commands.registerCommand("revu.goToNote", goToNote),
    vscode.commands.registerCommand("revu.cycleView", cycleView),
    vscode.commands.registerCommand("revu.editAnnotation", editAnnotation),
    vscode.commands.registerCommand("revu.saveAnnotation", saveAnnotation),
    vscode.commands.registerCommand("revu.cancelAnnotation", cancelAnnotation),
  )

  await loadFromDisk()
  refresh()
}

const storeUri = (): vscode.Uri | undefined => {
  const folders = vscode.workspace.workspaceFolders
  return folders ? vscode.Uri.joinPath(folders[0].uri, ".revu.json") : undefined
}

type StoredNote = {
  file: string
  startLine: number
  endLine: number
  text: string
}

type StoreShape = {
  prompt?: string
  comments: StoredNote[]
}

const DEFAULT_PROMPT =
  "Code review — inline annotations per file and line. " +
  "Each annotation is an issue, question, or required change. " +
  "Implement all changes."

let savedPrompt = DEFAULT_PROMPT

const saveToDisk = async () => {
  const uri = storeUri()
  if (!uri) return
  const comments: StoredNote[] = threads.flatMap((t) =>
    t.comments.map((c) => ({
      file: vscode.workspace.asRelativePath(t.uri),
      startLine: t.range?.start.line ?? 0,
      endLine: t.range?.end.line ?? 0,
      text: c.body instanceof vscode.MarkdownString ? c.body.value : c.body,
    })),
  )
  const data: StoreShape = { prompt: savedPrompt, comments }
  await vscode.workspace.fs.writeFile(
    uri,
    Buffer.from(JSON.stringify(data, null, 2)),
  )
}

const loadFromDisk = async () => {
  const uri = storeUri()
  if (!uri) return
  try {
    const raw = await vscode.workspace.fs.readFile(uri)
    const parsed = JSON.parse(raw.toString())
    const data: StoreShape = Array.isArray(parsed)
      ? { comments: parsed.map((n: any) => ({ ...n, text: n.text ?? n.body })) }
      : parsed
    if (data.prompt) savedPrompt = data.prompt
    const folders = vscode.workspace.workspaceFolders!
    for (const note of data.comments ?? []) {
      const fileUri = vscode.Uri.joinPath(folders[0].uri, note.file)
      const thread = controller.createCommentThread(
        fileUri,
        new vscode.Range(note.startLine, 0, note.endLine, 0),
        [],
      )
      thread.comments = [new RevuComment(note.text, thread)]
      thread.collapsibleState = vscode.CommentThreadCollapsibleState.Collapsed
      thread.canReply = false
      trackThread(thread)
    }
  } catch {
    // no file yet — fresh session
  }
}

const makeAuthor = (): vscode.CommentAuthorInformation => ({
  name: "Annotation",
  iconPath: vscode.Uri.joinPath(extensionUri, "assets", "revu-logo.png"),
})

class RevuComment implements vscode.Comment {
  body: string | vscode.MarkdownString
  mode = vscode.CommentMode.Preview
  author: vscode.CommentAuthorInformation
  contextValue = "revuAnnotation"
  private savedBody: string | vscode.MarkdownString

  constructor(
    text: string,
    public readonly thread: vscode.CommentThread,
  ) {
    this.body = new vscode.MarkdownString(text)
    this.savedBody = this.body
    this.author = makeAuthor()
  }

  startEdit() {
    this.savedBody = this.body
    this.mode = vscode.CommentMode.Editing
    this.thread.comments = [...this.thread.comments]
  }

  saveEdit() {
    const text =
      this.body instanceof vscode.MarkdownString
        ? this.body.value
        : (this.body as string)
    this.body = new vscode.MarkdownString(text)
    this.savedBody = this.body
    this.mode = vscode.CommentMode.Preview
    this.thread.comments = [...this.thread.comments]
  }

  cancelEdit() {
    this.body = this.savedBody
    this.mode = vscode.CommentMode.Preview
    this.thread.comments = [...this.thread.comments]
  }
}

const trackThread = (thread: vscode.CommentThread) => {
  const filename = thread.uri.path.split("/").pop() ?? ""
  const start = (thread.range?.start.line ?? 0) + 1
  const end = (thread.range?.end.line ?? 0) + 1
  const lines = start === end ? `line ${start}` : `lines ${start}–${end}`
  thread.label = `revu · ${filename} · ${lines}`
  threads.forEach(
    (t) =>
      (t.collapsibleState = vscode.CommentThreadCollapsibleState.Collapsed),
  )
  const original = thread.dispose.bind(thread)
  thread.dispose = () => {
    threads.splice(threads.indexOf(thread), 1)
    original()
    saveToDisk()
    refresh()
  }
  threads.push(thread)
  saveToDisk()
  refresh()
}

const addComment = async () => {
  await vscode.commands.executeCommand("workbench.action.addComment")
}

const createNote = (reply: vscode.CommentReply) => {
  const comment = new RevuComment(reply.text, reply.thread)
  reply.thread.comments = [comment]
  reply.thread.collapsibleState = vscode.CommentThreadCollapsibleState.Collapsed
  reply.thread.canReply = false
  trackThread(reply.thread)
}

const editAnnotation = (comment: RevuComment) => comment.startEdit()

const saveAnnotation = (comment: RevuComment) => {
  comment.saveEdit()
  saveToDisk()
}

const cancelAnnotation = (comment: RevuComment) => comment.cancelEdit()

const buildPayload = () => `${savedPrompt}\n\n${renderMarkdown(threads)}`

const copyToClipboard = async () => {
  if (threads.length === 0) {
    vscode.window.showInformationMessage("revu: no annotations to copy.")
    return
  }
  await vscode.env.clipboard.writeText(buildPayload())
  vscode.window.showInformationMessage("revu: review copied to clipboard.")
}

const exportMarkdown = async () => {
  if (threads.length === 0) {
    vscode.window.showInformationMessage("revu: no annotations to export.")
    return
  }
  const folders = vscode.workspace.workspaceFolders
  if (!folders) return
  const uri = vscode.Uri.joinPath(folders[0].uri, "revu-review.md")
  await vscode.workspace.fs.writeFile(uri, Buffer.from(buildPayload()))
  vscode.window.showTextDocument(uri)
}

const exportReview = async () => {
  if (threads.length === 0) {
    vscode.window.showInformationMessage("revu: no annotations to export.")
    return
  }
  vscode.commands.executeCommand("workbench.action.chat.open", {
    query: buildPayload(),
  })
}

const clearComments = async () => {
  const confirmed = await vscode.window.showWarningMessage(
    "Clear all annotations? This cannot be undone.",
    { modal: true },
    "Clear all",
  )
  if (confirmed !== "Clear all") return
  ;[...threads].forEach((t) => t.dispose())
  vscode.window.showInformationMessage("revu: all annotations cleared.")
}

const goToNote = (item: NoteItem) => {
  item.thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded
  vscode.window.showTextDocument(item.thread.uri, {
    selection: item.thread.range,
  })
}

const cycleView = () => {
  viewMode = VIEW_MODES[(VIEW_MODES.indexOf(viewMode) + 1) % VIEW_MODES.length]
  refresh()
}

const refresh = () => {
  notesProvider.refresh()
  const count = threads.length
  if (count === 0) {
    statusBar.hide()
    return
  }
  statusBar.text = `$(comment-discussion) ${count} revu note${count === 1 ? "" : "s"}`
  statusBar.tooltip = "revu: click to send to Copilot"
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

const groupByFile = (
  ts: vscode.CommentThread[],
): [string, vscode.CommentThread[]][] => {
  const map = new Map<string, vscode.CommentThread[]>()
  for (const t of ts) {
    const file = vscode.workspace.asRelativePath(t.uri)
    if (!map.has(file)) map.set(file, [])
    map.get(file)!.push(t)
  }
  return Array.from(map.entries())
}

type TreeNode = NoteItem | GroupItem

class RevuNotesProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  refresh() {
    this._onDidChangeTreeData.fire()
  }

  getTreeItem(element: TreeNode) {
    return element
  }

  getChildren(element?: TreeNode): TreeNode[] {
    const byLine = (a: vscode.CommentThread, b: vscode.CommentThread) =>
      (a.range?.start.line ?? 0) - (b.range?.start.line ?? 0)
    if (viewMode === "flat") {
      return element
        ? []
        : [...threads].sort(byLine).map((t) => new NoteItem(t, false))
    }
    if (element instanceof GroupItem)
      return [...element.threads].sort(byLine).map((t) => new NoteItem(t, true))
    return groupByFile(threads).map(([file, ts]) => new GroupItem(file, ts))
  }
}

class GroupItem extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly threads: vscode.CommentThread[],
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded)
    this.iconPath = new vscode.ThemeIcon("file")
    this.description = `${threads.length} note${threads.length === 1 ? "" : "s"}`
  }
}

class NoteItem extends vscode.TreeItem {
  constructor(
    public readonly thread: vscode.CommentThread,
    fileInDescription: boolean,
  ) {
    const file = vscode.workspace.asRelativePath(thread.uri)
    const start = (thread.range?.start.line ?? 0) + 1
    const end = (thread.range?.end.line ?? 0) + 1
    const lines = start === end ? `line ${start}` : `lines ${start}–${end}`
    const firstComment = thread.comments[0]
    const preview = firstComment
      ? (firstComment.body instanceof vscode.MarkdownString
          ? firstComment.body.value
          : firstComment.body
        ).slice(0, 60)
      : "…"

    super(
      fileInDescription ? lines : `${file}:${start}`,
      vscode.TreeItemCollapsibleState.None,
    )
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
