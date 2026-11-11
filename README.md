# Enrichr MCP Server

This is a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server. It lets MCP clients (Claude Desktop, Claude Code, Continue, etc.) query the upstream Enrichr API in natural language. It is one of 100+ servers in the [Bio MCP](../../README.md) monorepo.

## Connect

The configured production endpoint is:

```
https://enrichr-mcp-server.quentincody.workers.dev/mcp
```

Add it to your MCP client (Claude Desktop → Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "enrichr": {
      "command": "npx",
      "args": ["mcp-remote", "https://enrichr-mcp-server.quentincody.workers.dev/mcp"]
    }
  }
}
```

For local development the server runs at `http://localhost:8856/mcp` (start it with `./scripts/dev-servers.sh enrichr`):

```json
{
  "mcpServers": {
    "enrichr-local": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:8856/mcp"]
    }
  }
}
```

## Tools

- `enrichr_search` — discover available API operations (Code Mode catalog search, 9 operations)
- `enrichr_execute` — **Code Mode**: write JavaScript in a V8 isolate (`api.get()` / `api.post()` / `searchSpec()`) instead of issuing tool calls one by one
- `enrichr_query_data` — run SQL over large responses auto-staged into a per-session SQLite database
- `enrichr_get_schema` — inspect the inferred schema of a staged dataset

Large responses (>30KB) are auto-staged into a queryable SQLite database; the tools return a `data_access_id` you can query with SQL.

Every tool has both `enrichr_*` and `mcp_enrichr_*` aliases. Every tool returns both a human-readable `content` summary and a structured `structuredContent` payload.

## Development

```bash
./scripts/dev-servers.sh enrichr            # run locally (port 8856)
pnpm --filter enrichr-mcp-server run deploy   # deploy to Cloudflare Workers
```

See [`docs/adding-mcp-servers.md`](../../docs/adding-mcp-servers.md) and the root [README](../../README.md) for the full architecture (Code Mode, staging, portals).

## Library discovery and reproducibility

Call `/datasetStatistics` to discover exact library names and current metadata. Names containing years are labels, not proof of immutable content. The server records the selected name, full discovery row, retrieval time, source URL and request hash in `_enrichr`. An unavailable/ambiguous library fails explicitly; a missing library key in an analysis response is not treated as zero hits. A present empty result array remains a valid empty result.

`GET /libraries/snapshot` is a local adapter operation taking `libraryName`. It reads the provider's `/geneSetLibrary?mode=text`, preserves its UTF-8 GMT content and computes `library_sha256`. Downloads are bounded to 8 MiB; oversized libraries fail without truncation. Preserve the full returned object or staging handle. Classic `GET /enrich` optionally accepts adapter-only `expected_library_sha256`, checked against GMT downloads before and after analysis. Checks detect observed changes, but the provider offers no verified transaction-level snapshot guarantee. They are not supported for Speedrichr because equality of the two services' library snapshots is unverified.

```javascript
return await api.get("/libraries/snapshot", {libraryName: "KEGG_2021_Human"});
```

This is an example name, not a claim that it is the newest library. First discover availability. If a snapshot stages, its bounded `library_snapshot` SQL row retains the hash and source. The classic catalog recipe reads that row with `api.query`, retains the full snapshot handle and continues to submission/enrichment. `snapshot_lines` retains every native GMT line, including its line ending; full content remains in `payloads`.

## Custom backgrounds

The provider-maintained Python client supports a separate Speedrichr service. These adapter routes map to `https://maayanlab.cloud/speedrichr/api`:

- `POST /speedrichr/addList`: newline-separated `list`, optional `description`; multipart submission returns `userListId`.
- `POST /speedrichr/addbackground`: newline-separated `background`; form-encoded submission returns `backgroundid`.
- `POST /speedrichr/backgroundenrich`: form-encoded `userListId`, `backgroundid`, `backgroundType`.
- `GET /speedrichr/enrich`: `userListId` and `backgroundType`, without a custom background.

Use IDs from the same backend. Supply the complete measured gene universe as the background. The catalog's custom-background recipe retains both submission responses (including original inputs) and the analysis. Speedrichr failures never fall back to uncorrected classic Enrichr. Library metadata is explicitly attributed to the Enrichr catalog and does not assert an observed Speedrichr version.

`overlapping_genes_raw` preserves the native array alongside the legacy comma-separated string, and `raw_values` preserves every positional field, including future additions. Unknown top-level provider fields survive. The current [API table](https://maayanlab.cloud/Enrichr/templates/help/api-content.html) identifies column four as **odds ratio for both backends**. Both now expose `odds_ratio`; classic `z_score` remains a deprecated numeric alias for compatibility and does not represent a computed Z-score. Native values are not recalculated. An independent comparison of all 87 sampled classic rows matched the current GMT overlaps and the [documented odds-ratio/combined-score formulas](https://maayanlab.cloud/Enrichr/templates/help/background-content.html).

Speedrichr can emit bare `Infinity` and `NaN`, which are not valid JSON numbers. Enrichment parsing represents these as explicit `{nonfinite: "Infinity"}` / `{nonfinite: "NaN"}` objects (also supports `-Infinity`). Literal strings remain strings. `_enrichr_transport` retains the exact native text, SHA-256 and UTF-16 token offsets. These markers are not zero, null or finite values. Other malformed syntax still fails; provider text is never evaluated.

SQL preserves `enrichment_results`, `library_stats`, `library_categories`, `gene_list` and complete `response_context`, as applicable. Native result rows and nonfinite markers remain in `native_json`; full native nonstandard response text remains in the context and original payload. `enrichr_get_schema` shows the available projections.

A shared 60-second deadline bounds each adapter operation; body reads also have an independent 15-second deadline and nonblocking cancellation. Uploads are bounded to 1 MiB and ordinary responses to 2 MiB (GMT: 8 MiB). Partial and invalid UTF-8/JSON responses fail with bounded evidence; HTTP errors retain their complete text/problem fields. All eight aliases carry canonical citations and stage full composed results above 30 KiB. Redirects are rejected. Return complete objects or staging/error handles; there is no `.data` wrapper.

References: [Enrichr help](https://maayanlab.cloud/Enrichr/help), [provider classic client](https://maayanlab.github.io/maayanlab-bioinformatics/_modules/maayanlab_bioinformatics/api/enrichr.html), [provider Speedrichr client](https://maayanlab.github.io/maayanlab-bioinformatics/_modules/maayanlab_bioinformatics/api/speedrichr.html), [live library discovery](https://maayanlab.cloud/Enrichr/datasetStatistics).

## Validation status (2026-10-04)

Native/local acceptance passed **781 MCP calls** and all four recipes. All 228 library records/eight categories and the 320-term, 209,631-byte GMT matched native captures and SQL recovery. Both custom-background aliases preserved 87 native rows and 22 infinite score cells; the toy recipe preserved 52 rows with 34 infinite and six undefined (`NaN`) cells, independently checked with Python. Classic and uncorrected Speedrichr samples each returned 87 terms. Full HTTP 400/500 errors, stale hash rejection, staged continuation and canonical proofs pass.

**50 focused tests + 203 catalog checks**, direct TypeScript/lint, dry bundle and the local contract harness pass. Repository-wide checks are recorded in the [verification receipt](../../scratch/2026-10-04-enrichr/verification.json). Before/after GMTs match for this run; actual mid-request drift, atomic snapshots and general Enrichr/Speedrichr equivalence remain unverified. No new dated API release or production deployment is claimed.

<!-- license-and-data-terms:start -->
## License and data terms

The code in this repository is licensed under the Apache License 2.0 (see `LICENSE`).
If you use it in your work, please cite it (see `CITATION.cff`). Citation is requested, not required.

The license covers the code only. Data that this server returns comes from Enrichr and stays under the terms of that source: Free for non-profit use; commercial license via Mount Sinai.
You are responsible for your use of the data under those terms.
<!-- license-and-data-terms:end -->
