import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { fail } from "./http";

const ROUTES: Record<string, { method: string; fields: string[] }> = {
  "/datasetStatistics": { method: "GET", fields: [] },
  "/view": { method: "GET", fields: ["userListId"] },
  "/addList": { method: "POST", fields: ["list", "description"] },
  "/enrich": { method: "GET", fields: ["userListId", "backgroundType"] },
  "/libraries/snapshot": { method: "GET", fields: ["libraryName"] },
  "/speedrichr/addList": { method: "POST", fields: ["list", "description"] },
  "/speedrichr/addbackground": { method: "POST", fields: ["background"] },
  "/speedrichr/backgroundenrich": { method: "POST", fields: ["userListId", "backgroundid", "backgroundType"] },
  "/speedrichr/enrich": { method: "GET", fields: ["userListId", "backgroundType"] },
};
export function requestInput(request: Parameters<ApiFetchFn>[0]) {
  const route = ROUTES[request.path];
  if (!route) fail("Unsupported Enrichr endpoint", 404);
  if (request.method.toUpperCase() !== route.method) fail("Unsupported HTTP method", 405);
  const params = { ...request.params };
  const expected = params.expected_library_sha256;
  delete params.expected_library_sha256;
  if (expected !== undefined && (typeof expected !== "string" || !/^[a-f0-9]{64}$/.test(expected))) fail("expected_library_sha256 must be a lowercase SHA-256 digest");
  if (expected && !["/enrich", "/libraries/snapshot"].includes(request.path)) fail("Library content pinning is supported for classic Enrichr only; Speedrichr snapshot equivalence is unverified");
  const body = request.body;
  if (route.method === "GET" && body !== undefined) fail("GET cannot have a body");
  if (route.method === "POST" && (!body || typeof body !== "object" || Array.isArray(body))) fail("Expected an object body");
  if (route.method === "POST" && Object.keys(params).length) fail("POST query parameters accept only supported adapter controls");
  const data = validateEnrichmentFields(route, body, params);
  return { path: request.path, method: route.method, data, expected: expected as string | undefined, speed: request.path.startsWith("/speedrichr/"), enrichment: request.path.endsWith("enrich") };
}

function validateEnrichmentFields(route: { method: string; fields: string[]; }, body: unknown, params: { [x: string]: unknown; }) {
  const data = route.method === "POST" ? { ...body as Record<string, unknown> } : params;
  for (const key of Object.keys(data)) if (!route.fields.includes(key)) fail(`Unsupported field ${key}`);
  for (const field of route.fields.filter(key => key !== "description")) {
    if (data[field] === undefined) fail(`Missing ${field}`);
  }
  for (const field of ["userListId"]) {
    const value = data[field];
    if (value !== undefined && !((typeof value === "string" && /^\d{1,20}$/.test(value) && /[1-9]/.test(value)) || (typeof value === "number" && Number.isSafeInteger(value) && value > 0))) fail(`${field} must be a positive identifier`);
  }
  if (data.backgroundid !== undefined && (!(typeof data.backgroundid === "string" || typeof data.backgroundid === "number") || !/^[A-Za-z0-9_-]{1,128}$/.test(String(data.backgroundid)))) fail("Invalid backgroundid");
  for (const field of ["list", "background", "backgroundType", "libraryName", "description"]) {
    const value = data[field];
    if (value !== undefined && (typeof value !== "string" || (field !== "description" && !value.trim()) || value.includes("\0"))) fail(`${field} must be a nonempty string`);
  }
  if (new TextEncoder().encode(JSON.stringify(data)).byteLength > 1024 * 1024) fail("Enrichr request exceeds 1 MiB");
  return data;
}
