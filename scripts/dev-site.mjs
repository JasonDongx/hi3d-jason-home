// 跨平台启动「成品内容」开发预览，等价于 Unix shell 的 `SITE_CONTENT=site pnpm dev`。
// Windows 的 PowerShell / CMD 不认 `VAR=value command` 写法，所以这里用子进程注入环境变量。
// 只在当前进程内生效，不修改系统环境、不写任何文件。
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')

const child = spawn(process.execPath, [viteBin, ...process.argv.slice(2)], {
  cwd: root,
  env: { ...process.env, SITE_CONTENT: 'site' },
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
