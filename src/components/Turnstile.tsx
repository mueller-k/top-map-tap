import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: {
          sitekey: string
          action: string
          callback: (token: string) => void
          'expired-callback': () => void
          'error-callback': () => void
        },
      ) => string
      remove: (id: string) => void
    }
  }
}

export function Turnstile({
  siteKey,
  resetKey,
  onToken,
}: {
  siteKey: string
  resetKey: number
  onToken: (token: string) => void
}) {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let widgetId: string | null = null
    let cancelled = false
    const render = () => {
      if (cancelled || !container.current) return
      if (!window.turnstile) {
        window.setTimeout(render, 100)
        return
      }
      container.current.replaceChildren()
      widgetId = window.turnstile.render(container.current, {
        sitekey: siteKey,
        action: 'create-dashboard',
        callback: onToken,
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken(''),
      })
    }
    render()
    return () => {
      cancelled = true
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId)
    }
  }, [siteKey, resetKey, onToken])

  return <div className="turnstile" ref={container} data-action="turnstile-spin-v1" />
}

