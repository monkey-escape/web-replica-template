export function renderRecap({ date, commits, reports, rot }) {
  const commitText =
    commits.length > 0 ? commits.map((line) => `- ${line}`).join('\n') : '- 这一天没有提交。'

  const completeReports = reports.filter((report) => report.complete === true)
  const incompleteReports = reports.filter((report) => report.complete !== true)

  const reportText =
    completeReports.length === 0
      ? '- 没有完整的 parity 报告。'
      : completeReports
          .map((report) => {
            const failed = Array.isArray(report.failed) ? report.failed.length : 0
            const passed = Array.isArray(report.passed) ? report.passed.length : 0
            return `- \`${report.file}\` site=\`${report.siteId}\` passed=${passed} failed=${failed}`
          })
          .join('\n')

  const incompleteText =
    incompleteReports.length === 0
      ? '- 没有被排除的半成品日志。'
      : incompleteReports
          .map((report) => `- 排除 \`${report.file}\`：报告没有 complete: true，不能拿来写复盘。`)
          .join('\n')

  const rotText =
    rot.length === 0
      ? '- 没有发现可清理项。'
      : rot.map((item) => `- \`${item.path}\`（${item.reasons.join(', ')}）`).join('\n')

  return `# ${date} 复盘

## 当天提交

${commitText}

## 完整的 parity 日志

${reportText}

## 未纳入复盘的日志

${incompleteText}

## 残留与腐烂代码

下面这些可以在确认后用 \`pnpm recap --apply-clean\` 删掉。脚本只删带 \`@replica-rotten\` 的文件、\`*.bak\` / \`*.orig\` / \`*.obsolete.*\`，以及已经被写进本次复盘的 \`temp/\`。

${rotText}

## 清理记录

- 尚未执行清理。
`
}
