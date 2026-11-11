import { parseEnrichmentJson } from "./nonfinite";
import { fail, readEnrichrResponse } from "./read-response";

export { fail } from "./read-response";
export const ENRICHR_BASE = "https://maayanlab.cloud/Enrichr";
export const SPEEDRICHR_BASE = "https://maayanlab.cloud/speedrichr/api";
export async function digest(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}
export async function boundedText(response: Response, maxBytes = 2 * 1024 * 1024): Promise<string> {
  const text = await readEnrichrResponse(response, maxBytes);
  if (!response.ok) {
    let problem: unknown;
    try { problem = JSON.parse(text); } catch { problem = undefined; }
    fail(`Enrichr HTTP ${response.status}`, response.status, { response: text, problem, http_status: response.status,
      source_url: response.url || undefined, retry_after: response.headers.get("Retry-After"), incomplete: true });
  }
  return text;
}
export async function jsonResponse(response: Response, enrichment = false): Promise<Record<string, unknown>> {
  const text = await boundedText(response);
  let value: unknown;
  let tokens: Array<{ offset_utf16: number; token: string }> = [];
  const evidence = { response: text, http_status: response.status, incomplete: true };
  try {
    if (enrichment) ({ value, tokens } = parseEnrichmentJson(text));
    else value = JSON.parse(text);
  } catch { fail("Enrichr returned invalid JSON", 502, evidence); }
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Invalid Enrichr response envelope", 502, evidence);
  if ("error" in value && value.error) fail("Enrichr returned an error", 502, { ...evidence, problem: value });
  return { ...value as Record<string, unknown>, ...(tokens.length ? { _enrichr_transport: {
    nonfinite_tokens: tokens, representation: "Bare nonfinite numeric tokens are represented as {nonfinite: token}; literal strings are unchanged.",
    native_response: text, native_response_sha256: await digest(text),
  } } : {}) };
}
export async function enrichrFetch(path: string, params: Record<string, unknown>, signal: AbortSignal, body?: Record<string, unknown>): Promise<Response> {
  const speed = path.startsWith("/speedrichr/");
  const route = speed ? path.slice("/speedrichr".length) : path;
  const url = new URL(`${speed ? SPEEDRICHR_BASE : ENRICHR_BASE}${route}`);
  for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, String(value));
  let payload: FormData | URLSearchParams | undefined;
  if (body) {
    payload = route === "/addList" ? new FormData() : new URLSearchParams();
    for (const [key, value] of Object.entries(body)) payload.append(key, String(value));
  }
  return fetch(url, { method: body ? "POST" : "GET", body: payload, signal, redirect: "manual", headers: { Accept: "application/json", "User-Agent": "enrichr-mcp-server/1.0 (bio-mcp)" } });
}
