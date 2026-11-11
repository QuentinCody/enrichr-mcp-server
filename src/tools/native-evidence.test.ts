import { verifyCitationEnvelope } from "@bio-mcp/shared";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ RpcTarget: class {}, DurableObject: class { constructor(public ctx: unknown, public env: unknown) {} } }));

import { fixture, recover } from "./staging-fixture";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function invoke(f: ReturnType<typeof fixture>, name: string, args: Record<string, unknown>, failed = false) {
  const result = await f.tools[name].handler(args, {});
  expect(result.isError === true, JSON.stringify(result).slice(0, 500)).toBe(failed);
  expect(result.content.length).toBeGreaterThan(0);
  const sc = result.structuredContent;
  const id = sc.staged ? sc.data_access_id : sc.data?.__staged ? sc.data.data_access_id : undefined;
  const staged = id ? await recover(f, id, "") : undefined;
  const proof = await verifyCitationEnvelope({ citation: sc._meta?.citation, structuredContent: sc, toolArguments: args,
    ...(staged ? { materialized: { value: staged } } : {}) });
  expect(proof.verification).toMatchObject({ query: "verified", result: "verified" });
  expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(30720);
  return { sc, id, data: sc.staged ? staged.structuredContent.data : sc.data?.__staged ? staged : sc.data };
}

it.each(["", "mcp_"])("verifies all %s aliases, argument hashes and error envelopes", async prefix => {
  const f = fixture();
  try {
    await invoke(f, `${prefix}enrichr_search`, { query: "enrichment" });
    await invoke(f, `${prefix}enrichr_execute`, { code: "return {value:'001'};" });
    await invoke(f, `${prefix}enrichr_execute`, { code: "" }, true);
    await invoke(f, `${prefix}enrichr_query_data`, { data_access_id: "missing", sql: "SELECT * FROM missing" }, true);
    await invoke(f, `${prefix}enrichr_get_schema`, { data_access_id: "missing" });
  } finally { f.close(); }
});

it("continues checked enrichment through a staged GMT and preserves every native line", async () => {
  const f = fixture(); const library = "KEGG_2021_Human";
  const gmt = Array.from({length: 100}, (_, i) => `term${i}\t\t${"TP53\t".repeat(150)}BRCA1\r\n`).join("");
  const native = {[library]: [[1,"term",0.01,123,500,["TP53","BRCA1"],0.1,0,0]]};
  const requests: string[] = [];
  vi.stubGlobal("fetch", async (url: URL, options: RequestInit) => {
    requests.push(url.pathname);
    if(url.pathname.endsWith("datasetStatistics"))return Response.json({statistics:[{libraryName:library,numTerms:100}],categories:[{categoryId:1,name:"fixture"}]});
    if(url.pathname.endsWith("geneSetLibrary"))return new Response(gmt);
    if(url.pathname.endsWith("addList")){expect((options.body as FormData).get("list")).toBe("TP53\nBRCA1");return Response.json({userListId:12});}
    return Response.json(native);
  });
  try {
    const {workflows} = await import("../spec/workflows");
    const result = await invoke(f,"enrichr_execute",{code:workflows[2].code});
    expect(result.data,JSON.stringify(result.data)).toHaveProperty("submission.userListId",12);expect(result.data.enrichment[library][0]).toMatchObject({odds_ratio:123,z_score:123,raw_values:native[library][0]});
    expect(requests.filter(p=>p.endsWith("geneSetLibrary"))).toHaveLength(3);
    const id=result.data.library_snapshot.data_access_id;
    expect((await recover(f,id,"")).content).toBe(gmt);
    const lines=await invoke(f,"enrichr_query_data",{data_access_id:id,sql:"SELECT native_line FROM snapshot_lines ORDER BY line_index LIMIT 1"});
    expect(lines.data.rows[0].native_line).toBe(gmt.slice(0,gmt.indexOf("\n")+1));
  } finally {f.close();}
});

it("preserves nonfinite score markers, native text and complete error responses through SQLite", async () => {
  const f=fixture();const library="Fixture";
  const raw=`{"Fixture":[[1,"${"α".repeat(20000)}",0.1,Infinity,Infinity,["TP53"],0.2,0,0]]}`;
  vi.stubGlobal("fetch",async(url:URL)=>url.pathname.endsWith("datasetStatistics")?Response.json({statistics:[{libraryName:library}]}):new Response(raw));
  try {
    const result=await invoke(f,"enrichr_execute",{code:'return await api.post("/speedrichr/backgroundenrich",{userListId:1,backgroundid:"fixture",backgroundType:"Fixture"});'});
    expect(result.data[library][0].odds_ratio).toEqual({nonfinite:"Infinity"});expect(result.data._enrichr_transport.native_response).toBe(raw);
    const rows=await invoke(f,"mcp_enrichr_query_data",{data_access_id:result.id,sql:"SELECT odds_ratio,raw_values FROM enrichment_results"});
    expect(JSON.parse(rows.data.rows[0].odds_ratio)).toEqual({nonfinite:"Infinity"});
    const problem={message:"α".repeat(30000),extra:{code:"001"}};
    vi.stubGlobal("fetch",async()=>Response.json(problem,{status:400}));
    const failed=await invoke(f,"enrichr_execute",{code:'return await api.get("/view",{userListId:1});'},true);
    const evidence=failed.data.data.__staged?await recover(f,failed.data.data.data_access_id,""):failed.data.data;
    expect(evidence.problem).toEqual(problem);expect(JSON.parse(evidence.response)).toEqual(problem);
    const composed=await invoke(f,"mcp_enrichr_execute",{code:'return {notes:"α😀".repeat(12000),values:[0,null,"001"]};'});
    expect(composed.sc.staged).toBe(true);expect(composed.data.notes).toBe("α😀".repeat(12000));
  } finally {f.close();}
});
