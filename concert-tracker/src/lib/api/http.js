export class ApiError extends Error {
  constructor(message, { status, provider, hint } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.provider = provider
    this.hint = hint
  }
}

export async function fetchJson(url, { provider, timeoutMs = 15000, headers } = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  let res
  try {
    res = await fetch(url, { signal: ctrl.signal, headers })
  } catch (e) {
    clearTimeout(t)
    if (e?.name === 'AbortError') throw new ApiError(`${provider} did not respond in time`, { provider })
    throw new ApiError(`Could not reach ${provider}. Check your connection or an ad-blocker.`, { provider })
  }
  clearTimeout(t)
  let body = null
  const text = await res.text()
  try { body = text ? JSON.parse(text) : null } catch { body = { raw: text } }
  if (!res.ok) {
    const msg = body?.fault?.faultstring || body?.errors?.[0]?.detail || body?.error_message || body?.errorMessage || body?.message || `${provider} error ${res.status}`
    throw new ApiError(msg, { status: res.status, provider })
  }
  return body
}
