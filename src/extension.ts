import * as vscode from "vscode"

const CONTROLLER_ID = "revu"
const CONTROLLER_LABEL = "revu"

let controller: vscode.CommentController

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

  context.subscriptions.push(
    controller,
    vscode.commands.registerCommand("revu.addComment", addComment),
    vscode.commands.registerCommand("revu.exportReview", exportReview),
    vscode.commands.registerCommand("revu.clearComments", clearComments),
  )
}

const addComment = () => {
  const editor = vscode.window.activeTextEditor
  if (!editor) return

  const line = editor.selection.active.line
  const range = new vscode.Range(line, 0, line, 0)
  const thread = controller.createCommentThread(editor.document.uri, range, [])
  thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded
  thread.canReply = false

  vscode.commands.executeCommand("workbench.action.addComment")
}

const exportReview = async () => {
  const threads = collectThreads()
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
  collectThreads().forEach((t) => t.dispose())
  vscode.window.showInformationMessage("revu: all comments cleared.")
}

const collectThreads = (): vscode.CommentThread[] => {
  return (controller as any)._threads ?? []
}

const renderMarkdown = (threads: vscode.CommentThread[]): string => {
  const byFile = new Map<string, { line: number; body: string }[]>()

  for (const thread of threads) {
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

export const deactivate = () => {}
