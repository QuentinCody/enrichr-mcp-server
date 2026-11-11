import { boundedText, digest, ENRICHR_BASE, enrichrFetch, fail, jsonResponse } from "./http";
export async function libraryMetadata(name: string, signal: AbortSignal) {
  const data = await jsonResponse(await enrichrFetch("/datasetStatistics", {}, signal));
  if (!Array.isArray(data.statistics)) fail("Library discovery omitted statistics", 502);
  const rows = data.statistics.filter(row => row && typeof row === "object" && row.libraryName === name);
  if (rows.length !== 1) fail(`Library ${name} is missing or ambiguous in current Enrichr discovery`, 409);
  return rows[0] as Record<string, unknown>;
}
export async function librarySnapshot(name: string, signal: AbortSignal, expected?: string) {
  const params = { mode: "text", libraryName: name };
  const response = await enrichrFetch("/geneSetLibrary", params, signal);
  const content = await boundedText(response, 8 * 1024 * 1024);
  const lines = content.split(/\r?\n/).filter(line => line.length > 0);
  if (!lines.length || lines.some(line => line.startsWith("<") || line.split("\t").length < 3)) fail("Library download is not nonempty GMT", 502);
  const sha256 = await digest(content);
  if (expected && sha256 !== expected) fail(`Library ${name} content differs from expected SHA-256`, 409,
    { libraryName: name, expected_sha256: expected, observed_sha256: sha256, content, incomplete: true });
  return { libraryName: name, library_sha256: sha256, source_url: `${ENRICHR_BASE}/geneSetLibrary?${new URLSearchParams(params)}`, content, term_count: lines.length };
}
export function transformEnrichment(data: Record<string, unknown>, library: string, speed: boolean) {
  const rows = data[library];
  if (!Array.isArray(rows)) fail(`Enrichment response omitted requested library ${library}; this is not an empty result`, 502);
  const terms = rows.map(row => {
    if (!Array.isArray(row) || row.length < 7) fail("Malformed enrichment result row", 502);
    return { rank: row[0], term_name: row[1], p_value: row[2],
      odds_ratio: row[3], ...(speed ? {} : { z_score: row[3] }),
      combined_score: row[4], overlapping_genes: Array.isArray(row[5]) ? row[5].join(", ") : row[5],
      overlapping_genes_raw: row[5], adjusted_p_value: row[6], old_p_value: row[7], old_adjusted_p_value: row[8], raw_values: row };
  });
  return { ...data, [library]: terms };
}
