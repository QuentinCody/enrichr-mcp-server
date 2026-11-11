import type { ApiEndpoint, WorkflowRecipe } from "@bio-mcp/shared/codemode/catalog";
export const additionalEndpoints: ApiEndpoint[] = [
  { method: "GET", path: "/libraries/snapshot", category: "libraries", featured: true,
    summary: "Adapter operation: capture one Enrichr library's metadata, exact GMT and SHA-256.",
    description: "Downloads native /geneSetLibrary?mode=text with an 8 MiB bound. Captures current content, not an immutable release. Full GMT stages when large. Use expected_library_sha256 to reject a changed download.",
    queryParams: [{name: "libraryName", type: "string", required: true, description: "Exact name discovered in /datasetStatistics"}, {name: "expected_library_sha256", type: "string", required: false, description: "Previously observed SHA-256 of the UTF-8 GMT; adapter-only."}],
    example: 'return await api.get("/libraries/snapshot", {libraryName: "KEGG_2021_Human"});' },
  { method: "POST", path: "/speedrichr/addList", category: "background", summary: "Submit genes to Speedrichr for background-aware analysis.",
    description: "Separate userListId namespace from classic Enrichr. list is newline-separated genes; description optional. Converted to multipart form data.", body: { contentType: "multipart/form-data" },
    example: 'return await api.post("/speedrichr/addList", {list: "TP53\\nBRCA1", description: "example"});' },
  { method: "POST", path: "/speedrichr/addbackground", category: "background", summary: "Submit the measured background gene universe to Speedrichr.",
    description: "Body background is a newline-separated gene string. Converted to application/x-www-form-urlencoded; preserve returned backgroundid.", body: { contentType: "application/x-www-form-urlencoded" },
    example: 'return await api.post("/speedrichr/addbackground", {background: "TP53\\nBRCA1\\nEGFR"});' },
  { method: "POST", path: "/speedrichr/backgroundenrich", category: "background", featured: true,
    summary: "Run Speedrichr enrichment with an explicit background.",
    description: "Form fields: userListId from Speedrichr addList, backgroundid from addbackground, and exact backgroundType library. No implicit fallback to uncorrected Enrichr. Metadata identifies the Enrichr catalog source; Speedrichr library version equivalence remains unverified.", body: { contentType: "application/x-www-form-urlencoded" },
    example: 'return await api.post("/speedrichr/backgroundenrich", {userListId: 123, backgroundid: "example-id", backgroundType: "KEGG_2021_Human"});' },
  { method: "GET", path: "/speedrichr/enrich", category: "enrichment", summary: "Speedrichr enrichment without a custom background.",
    queryParams: [{name: "userListId", type: "number", required: true, description: "Speedrichr user list identifier"}, {name: "backgroundType", type: "string", required: true, description: "Exact library name"}],
    example: 'return await api.get("/speedrichr/enrich", {userListId: 123, backgroundType: "KEGG_2021_Human"});' },
];
const guard = 'if (r.__api_error || r.__stage_error || r.__staged) return r;';
export const workflows: WorkflowRecipe[] = [
  { title: "Discover library names before analysis", keywords: ["library", "version", "discovery"],
    description: "Inspect current metadata and choose an exact library name. If staged, use query_data; do not silently choose the first or newest name.",
    code: 'return await api.get("/datasetStatistics");' },
  { title: "Capture a reproducible library artifact", keywords: ["library", "sha256", "version", "GMT"],
    description: "First confirm this example name in discovery. Preserve the GMT snapshot or staging handle and record its SHA-256. This captures library content without claiming an immutable provider release.",
    code: 'return await api.get("/libraries/snapshot", {libraryName: "KEGG_2021_Human"});' },
  { title: "Classic enrichment with checked library content", keywords: ["enrichment", "hash", "reproduce"],
    description: "Preserve the full snapshot handle and read its bounded library_snapshot row through api.query before submitting genes. Before/after checks do not prove transaction-level snapshot isolation.",
    code: `let r = await api.get("/libraries/snapshot", {libraryName: "KEGG_2021_Human"});
if (r.__api_error || r.__stage_error) return r;
const snapshot = r;
let expected = r.library_sha256;
if (r.__staged) {
  const stored = await api.query(r.data_access_id, "SELECT library_sha256 FROM library_snapshot LIMIT 1");
  if (stored.__query_error || stored.truncated || stored.results?.length !== 1 || !stored.results[0].library_sha256) return {library_snapshot: snapshot, continuation: stored};
  expected = stored.results[0].library_sha256;
}
r = await api.post("/addList", {list: "TP53\\nBRCA1", description: "example"});
${guard}
const submission = r;
return {library_snapshot: snapshot, submission, enrichment: await api.get("/enrich", {userListId: r.userListId, backgroundType: "KEGG_2021_Human", expected_library_sha256: expected})};` },
  { title: "Custom-background enrichment using Speedrichr", keywords: ["background", "Speedrichr", "measured universe"],
    description: "Replace the toy background with all measured genes. IDs must come from Speedrichr. Preserve backgroundid, userListId, exact library and result provenance; no assertion of identical Enrichr/Speedrichr library snapshots.",
    code: `let r = await api.post("/speedrichr/addList", {list: "TP53\\nBRCA1", description: "example"});
${guard}
const submission = r;
const userListId = r.userListId;
r = await api.post("/speedrichr/addbackground", {background: "TP53\\nBRCA1\\nEGFR\\nMYC\\nPTEN"});
${guard}
return {submission, background: r, enrichment: await api.post("/speedrichr/backgroundenrich", {userListId, backgroundid: r.backgroundid, backgroundType: "KEGG_2021_Human"})};` },
];
