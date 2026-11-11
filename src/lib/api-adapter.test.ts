import { afterEach, expect, it, vi } from "vitest";
import { createEnrichrApiFetch } from "./api-adapter";
import { boundedText, digest } from "./http";

const api = createEnrichrApiFetch();
const library = "KEGG_fixture";
const metadata = { libraryName: library, numTerms: 1, geneCoverage: 3, extra: "retained" };
const stats = { statistics: [metadata] };
const gmt = "A term\t\tTP53\tBRCA1\n";
const row = [1, "A term", 0.01, 2.3, 9, ["TP53", "BRCA1"], 0.02, 0, 0, { future: true }];
const result = { [library]: [row], provider_metadata: { retain: true } };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
function responses(...values: unknown[]) {
  const fetcher = vi.fn();
  for (const value of values) fetcher.mockResolvedValueOnce(value instanceof Response ? value : json(value));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
afterEach(() => vi.unstubAllGlobals());
it("preserves native columns, overlap arrays, future fields and exact library metadata", async () => {
  responses(stats, result);
  expect(await api({ method: "GET", path: "/enrich", params: { userListId: 1, backgroundType: library } })).toMatchObject({ data: { provider_metadata: result.provider_metadata, [library]: [{ z_score: 2.3, raw_values: row, overlapping_genes: "TP53, BRCA1", overlapping_genes_raw: row[5] }], _enrichr: { selected_library: library, library_metadata: metadata, library_version: null } } });
});
it("uploads list text unchanged using multipart to the selected backend", async () => {
  const fetcher = responses({ userListId: 12, shortId: "abc" });
  await api({ method: "POST", path: "/speedrichr/addList", body: { list: "TP53\nTP53\nBRCA1", description: "a+b" } });
  expect(String(fetcher.mock.calls[0][0])).toBe("https://maayanlab.cloud/speedrichr/api/addList");
  const options = fetcher.mock.calls[0][1];
  expect(options).toMatchObject({ method: "POST", redirect: "manual", signal: expect.any(AbortSignal) });
  expect(options.body).toBeInstanceOf(FormData);
  expect(options.body.get("list")).toBe("TP53\nTP53\nBRCA1");
});
it("encodes background and analysis as URL-encoded forms, preserving opaque IDs", async () => {
  const fetcher = responses({ backgroundid: "opaque-id" }, stats, result);
  await api({ method: "POST", path: "/speedrichr/addbackground", body: { background: "TP53\nBRCA1\nA+B" } });
  const response = await api({ method: "POST", path: "/speedrichr/backgroundenrich", body: { userListId: 7, backgroundid: "opaque-id", backgroundType: library } });
  expect(fetcher.mock.calls[0][1].body).toBeInstanceOf(URLSearchParams);
  expect(fetcher.mock.calls[0][1].body.get("background")).toBe("TP53\nBRCA1\nA+B");
  expect(fetcher.mock.calls[2][1].body.get("backgroundid")).toBe("opaque-id");
  expect(response).toMatchObject({ data: { [library]: [{ odds_ratio: 2.3, raw_values: row }], _enrichr: { backend: "speedrichr", custom_background: true } } });
  expect((response.data as Record<string, unknown[]>)[library][0]).not.toHaveProperty("z_score");
});
it("captures full GMT and its independently reproducible digest", async () => {
  responses(stats, new Response(gmt));
  expect(await api({ method: "GET", path: "/libraries/snapshot", params: { libraryName: library } })).toMatchObject({ data: { content: gmt, library_sha256: await digest(gmt), term_count: 1, metadata } });
});
it("checks expected content before and after classic enrichment with one shared deadline", async () => {
  const fetcher = responses(stats, new Response(gmt), result, new Response(gmt));
  const hash = await digest(gmt);
  expect(await api({ method: "GET", path: "/enrich", params: { userListId: 1, backgroundType: library, expected_library_sha256: hash } })).toMatchObject({ data: { _enrichr: { library_sha256: hash, library_verification: "enrichr_gmt_hash_checked" } } });
  expect(fetcher).toHaveBeenCalledTimes(4);
  for (const [url, options] of fetcher.mock.calls) {
    expect(String(url)).not.toContain("expected_library_sha256");
    expect(options.signal).toBe(fetcher.mock.calls[0][1].signal);
  }
});
it("rejects drift after analysis", async () => {
  responses(stats, new Response(gmt), result, new Response(`${gmt}B\t\tMYC\n`));
  const expectedHash = await digest(gmt);
  const observedHash = await digest(`${gmt}B\t\tMYC\n`);
  await expect(api({ method: "GET", path: "/enrich", params: { userListId: 1, backgroundType: library, expected_library_sha256: expectedHash } })).rejects.toMatchObject({
    status: 409, data: {analysis: {[library]: [{raw_values: row}]}, library_metadata: metadata,
      failure: {expected_sha256: expectedHash, observed_sha256: observedHash, content: `${gmt}B\t\tMYC\n`, incomplete: true}},
  });
});
it("rejects unavailable library before submitting an analysis", async () => {
  const fetcher = responses({ statistics: [] });
  await expect(api({ method: "GET", path: "/enrich", params: { userListId: 1, backgroundType: library } })).rejects.toMatchObject({ status: 409 });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("distinguishes a missing library key from valid zero-hit results", async () => {
  responses(stats, {});
  await expect(api({ method: "GET", path: "/enrich", params: { userListId: 1, backgroundType: library } })).rejects.toThrow("omitted requested library");
  responses(stats, { [library]: [] });
  expect(await api({ method: "GET", path: "/enrich", params: { userListId: 1, backgroundType: library } })).toMatchObject({ data: { [library]: [] } });
});
it.each([
  { method: "GET", path: "/addList" },
  { method: "POST", path: "/view", body: {} },
  { method: "GET", path: "https://evil.test/" },
  { method: "POST", path: "/addList", body: { list: "" } },
  { method: "POST", path: "/addList", body: { list: ["TP53"] } },
  { method: "GET", path: "/view", params: { userListId: -1 } },
  { method: "GET", path: "/view", params: { userListId: 1.2 } },
  { method: "GET", path: "/enrich", params: { userListId: 1 } },
  { method: "GET", path: "/datasetStatistics", params: { ignored: true } },
  { method: "GET", path: "/datasetStatistics", body: {} },
  { method: "POST", path: "/speedrichr/backgroundenrich", body: { userListId: 1, backgroundType: library } },
  { method: "GET", path: "/speedrichr/enrich", params: { userListId: 1, backgroundType: library, expected_library_sha256: "a".repeat(64) } },
  { method: "GET", path: "/enrich", params: { userListId: 1, backgroundType: library, expected_library_sha256: "invalid" } },
])("rejects invalid or misleading requests before fetch %#", async request => {
  const fetcher = responses();
  await expect(api(request)).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});
it.each([new Response("<html>error</html>"), json({ error: "bad query" }), json(null), json({ message: "missing" }, 404)])("rejects invalid/error envelopes %#", async response => {
  responses(response);
  await expect(api({ method: "GET", path: "/datasetStatistics" })).rejects.toThrow();
});
it("does not fallback from failed custom-background analysis", async () => {
  const fetcher = responses(stats, json({ error: "unsupported" }, 503));
  await expect(api({ method: "POST", path: "/speedrichr/backgroundenrich", body: { userListId: 1, backgroundid: "abc", backgroundType: library } })).rejects.toMatchObject({ status: 503 });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("rejects HTML pretending to be a GMT download", async () => {
  responses(stats, new Response("<html>error</html>"));
  await expect(api({ method: "GET", path: "/libraries/snapshot", params: { libraryName: library } })).rejects.toThrow("GMT");
});
it("bounds chunked UTF-8 responses and cancels reading", async () => {
  const cancel = vi.fn();
  await expect(boundedText(new Response(new ReadableStream({ pull(c) { c.enqueue(new TextEncoder().encode("α".repeat(100))); }, cancel })), 250)).rejects.toThrow("250 bytes");
  expect(cancel).toHaveBeenCalled();
});
it("bounds uploads by bytes", async () => {
  const fetcher = responses();
  await expect(api({ method: "POST", path: "/addList", body: { list: "α".repeat(530_000) } })).rejects.toThrow("1 MiB");
  expect(fetcher).not.toHaveBeenCalled();
});
it("preserves BOM and line endings when hashing downloaded GMT", async () => {
  const content = `\uFEFF${gmt.replace(/\n/g, "\r\n")}`;
  responses(stats, new Response(content));
  expect(await api({ method: "GET", path: "/libraries/snapshot", params: {libraryName: library} })).toMatchObject({data: {content, library_sha256: await digest(content)}});
});
