import { processGroupMeExport } from '../../shared/history-import'

interface ImportWorkerRequest {
  file: File
  now: string
}

self.onmessage = async (event: MessageEvent<ImportWorkerRequest>) => {
  try {
    const source = await event.data.file.text()
    let parsed: unknown
    try {
      parsed = JSON.parse(source)
    } catch {
      self.postMessage({ ok: false, code: 'INVALID_JSON' })
      return
    }
    if (!Array.isArray(parsed)) {
      self.postMessage({ ok: false, code: 'EXPECTED_ARRAY' })
      return
    }
    const processed = processGroupMeExport(parsed, new Date(event.data.now))
    if (!processed.ok) {
      self.postMessage({ ok: false, code: processed.code })
      return
    }
    self.postMessage({
      ok: true,
      value: {
        candidates: processed.value.candidates,
        summary: processed.value.summary,
      },
    })
  } catch {
    self.postMessage({ ok: false, code: 'READ_FAILED' })
  }
}

