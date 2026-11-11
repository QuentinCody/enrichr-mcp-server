import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { digest, ENRICHR_BASE, enrichrFetch, fail, jsonResponse, SPEEDRICHR_BASE } from "./http";
import { requestInput } from "./input";
import { libraryMetadata, librarySnapshot, transformEnrichment } from "./libraries";

export function createEnrichrApiFetch(): ApiFetchFn {
  return async request => {
    const input = requestInput(request);
    const signal = AbortSignal.timeout(60_000);
    const library = (input.data.backgroundType ?? input.data.libraryName) as string | undefined;
    const metadata = library ? await libraryMetadata(library, signal) : undefined;
    let { status, data, before, route } = await readVerifiedEnrichment(library, input, signal, metadata);
    return { status, data: { ...data, _enrichr: {
      source_url: input.path === "/libraries/snapshot" ? before?.source_url : `${input.speed ? SPEEDRICHR_BASE : ENRICHR_BASE}${route}`,
      retrieved_at: new Date().toISOString(), backend: input.speed ? "speedrichr" : "enrichr",
      selected_library: library ?? null, library_metadata: metadata,
      library_sha256: before?.library_sha256 ?? null,
      library_version: metadata?.version ?? null,
      library_metadata_source: metadata ? `${ENRICHR_BASE}/datasetStatistics` : undefined,
      library_verification: input.expected ? "enrichr_gmt_hash_checked" : before ? "enrichr_gmt_observed" : library ? "name_and_metadata_only" : "not_applicable",
      snapshot_limit: "A library name/year is not an immutable version. GMT checks do not prove an atomic analysis snapshot or Speedrichr equivalence.",
      custom_background: input.path === "/speedrichr/backgroundenrich",
      ...(input.enrichment ? { score_column: "odds_ratio", legacy_z_score_alias: !input.speed } : {}),
      request: input.data, request_sha256: await digest(JSON.stringify({ path: input.path, data: input.data })),
    } } };
  };
}

async function readVerifiedEnrichment(library: string | undefined, input: { path: string; method: string; data: { [x: string]: unknown; }; expected: string | undefined; speed: boolean; enrichment: boolean; }, signal: AbortSignal, metadata: Record<string, unknown> | undefined) {
  const before = library && (input.expected || input.path === "/libraries/snapshot") ? await librarySnapshot(library, signal, input.expected) : undefined;
  let data: Record<string, unknown>;
  let status = 200;
  if (input.path === "/libraries/snapshot") {
    data = { ...before, metadata };
  } else {
    ({ status, data } = await readEnrichmentAnalysis(input, signal, library));
  }
  if (input.expected && input.enrichment) {
    try { await librarySnapshot(library!, signal, input.expected); }
    catch (error) {
      if (error instanceof Error) throw Object.assign(error, {
        data: {
          analysis: data, library_metadata: metadata,
          failure: "data" in error ? error.data : undefined, incomplete: true
        }
      });
      throw error;
    }
  }
  const route = input.speed ? input.path.slice("/speedrichr".length) : input.path;
  return { status, data, before, route };
}

async function readEnrichmentAnalysis(input: ReturnType<typeof requestInput>, signal: AbortSignal, library: string | undefined) {
  const response = await enrichrFetch(input.path, input.method === "GET" ? input.data : {}, signal, input.method === "POST" ? input.data : undefined);
  const status = response.status;
  let data = await jsonResponse(response, input.enrichment);
  if (input.path === "/datasetStatistics" && !Array.isArray(data.statistics)) fail("Library discovery omitted statistics", 502);
  if (input.path === "/view" && !Array.isArray(data.genes)) fail("Gene list response omitted genes", 502);
  if (input.path.endsWith("/addList") && !data.userListId) fail("Submission response omitted userListId", 502);
  if (input.path.endsWith("/addbackground") && !data.backgroundid) fail("Background response omitted backgroundid", 502);
  if (input.enrichment) data = transformEnrichment(data, library!, input.speed);
  return { status, data };
}
