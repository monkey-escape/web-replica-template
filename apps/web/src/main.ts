import './style.css'

const button = document.querySelector<HTMLButtonElement>('[data-interaction="ping-api"]')
const status = document.querySelector<HTMLElement>('#api-status')

// 只打到 Vite 代理后的本地 API，用来证明前后端骨架是通的。
button?.addEventListener('click', async () => {
  if (!status) return
  status.textContent = 'Checking API…'
  try {
    const response = await fetch('/api/health')
    if (!response.ok) throw new Error(String(response.status))
    const body = (await response.json()) as { ok?: boolean }
    status.textContent = body.ok ? 'API ok' : 'API responded without ok'
  } catch {
    status.textContent = 'API unreachable'
  }
})
