import { McpServer } from "@bio-mcp/shared/mcp";
import { createApiProxyTool } from "@bio-mcp/shared/tools/api-proxy";
import { afterEach, expect, it, vi } from "vitest";
import { createEnrichrApiFetch } from "../lib/api-adapter";
import { enrichrCatalog } from "../spec/catalog";
import { registerCodeMode } from "./code-mode";
import { registerGetSchema } from "./get-schema";
import { registerQueryData } from "./query-data";

const json = (data: unknown) => new Response(JSON.stringify(data));
afterEach(() => vi.unstubAllGlobals());
it("registers both aliases and discovers release discovery with both-fields contracts", async () => {
  const server = new McpServer({ name: "fixture", version: "1" });
  registerCodeMode(server, { CODE_MODE_LOADER: { get: () => ({}) } } as unknown as Parameters<typeof registerCodeMode>[1]);
  registerQueryData(server, {}); registerGetSchema(server, {});
  const tools = (server as unknown as { _registeredTools: Record<string, { handler: (args: unknown, extra: unknown) => Promise<unknown> }> })._registeredTools;
  for (const name of ["enrichr_search", "enrichr_execute", "enrichr_query_data", "enrichr_get_schema"]) {
    expect(tools[name]).toBeDefined(); expect(tools[`mcp_${name}`]).toBeDefined();
  }
  const result = await tools.mcp_enrichr_search.handler({ query: "Discover library names before analysis", category: "workflows", max_results: 5 }, {});
  expect(result).toMatchObject({ content: expect.any(Array), structuredContent: { success: true } });
  expect(JSON.stringify(result)).toContain("datasetStatistics");
  expect(await tools.mcp_enrichr_query_data.handler({ data_access_id: "enrichr_fixture", sql: "SELECT 1" }, {})).toMatchObject({ isError: true, content: expect.any(Array), structuredContent: expect.any(Object) });
  expect(enrichrCatalog.endpointCount).toBe(enrichrCatalog.endpoints.length);
});
it.each([{ __api_error: true, status: 409 }, { __staged: true, data_access_id: "enrichr_fixture" }, { __stage_error: true, message: "staging unavailable" }])("workflows preserve handles %#", async handle => {
  for (const workflow of enrichrCatalog.workflows!) {
    const run = new Function("api", `return (async () => { ${workflow.code} })()`);
    const actual = await run({ get: vi.fn().mockResolvedValue(handle), post: vi.fn().mockResolvedValue(handle), query: vi.fn().mockResolvedValue(handle) });
    expect(actual).toEqual(workflow.title.startsWith("Classic") && "__staged" in handle ? {library_snapshot: handle, continuation: handle} : handle);
  }
});
it("stages full overlap arrays, future columns and library metadata", async () => {
  const row = [1, "α".repeat(17_000), 0.1, 2, 3, ["TP53"], 0.2, 0, 0, {future: true}];
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({statistics: [{libraryName: "Fixture", numTerms: 1}]})).mockResolvedValueOnce(json({Fixture: [row]})));
  const stored: unknown[] = [];
  const namespace = { idFromName: (name: string) => name, get: () => ({ fetch: async (request: Request) => {
    if (new URL(request.url).pathname === "/process") {
      stored.push((await request.json() as { data: unknown }).data);
      return json({success: true, tables_created: ["Fixture"], total_rows: 1, input_rows: 1, table_row_counts: {Fixture: 1}});
    }
    return json({success: true, schema: {tables: {Fixture: {columns: [{name: "term_name"}]}}}});
  } }) } as unknown as DurableObjectNamespace;
  const proxy = createApiProxyTool({apiFetch: createEnrichrApiFetch(), catalog: enrichrCatalog, doNamespace: namespace, stagingPrefix: "enrichr", maxInlineBytes: 30 * 1024});
  const result = await proxy.handler({method: "GET", path: "/enrich", params: {userListId: 1, backgroundType: "Fixture"}}, {sql: () => []});
  expect(result).toMatchObject({__staged: true, data_access_id: expect.any(String)});
  expect(JSON.parse(stored[0] as string)).toMatchObject({Fixture: [{raw_values: row, overlapping_genes_raw: ["TP53"]}], _enrichr: {selected_library: "Fixture", library_metadata: {numTerms: 1}}});
  expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThan(30_000);
});
