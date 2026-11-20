/**
 * Wrapper around `fetch` that sends same-origin session cookies and signals
 * global auth expiration whenever any protected endpoint responds with `401`.
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, {
    credentials: "same-origin",
    ...init,
  })
  const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url
  if (res.status === 401 && !url.includes("/api/auth/login") && !url.includes("/api/auth/me")) {
    window.dispatchEvent(new Event("pinglo-auth-expired"))
  }
  return res
}
