import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";
import { additionalEndpoints, workflows } from "./workflows";

export const enrichrCatalog: ApiCatalog = {
	name: "Enrichr",
	baseUrl: "https://maayanlab.cloud/Enrichr",
  version: "runtime library discovery",
  auth: "none",
  endpointCount: 9,
  workflows,
  notes: "Discover exact library names with /datasetStatistics; do not assume a remembered year is available or immutable. " +
    "The original four Enrichr routes remain; /speedrichr/* routes use the separate provider Speedrichr service. " +
    "Submit user lists separately to each backend; their identifiers are not interchangeable. Custom backgrounds use Speedrichr. " +
    "Library metadata comes from Enrichr, not a verified Speedrichr snapshot. Use /libraries/snapshot to capture bounded GMT content and its SHA-256. " +
    "Classic /enrich accepts adapter-only expected_library_sha256 in params; before/after GMT checks detect observed differences but do not prove an atomic analysis snapshot. " +
    "Current provider documentation identifies column four as odds_ratio for both backends. Classic z_score is a deprecated numeric alias retained for compatibility, not a computed Z-score. " +
    "Results preserve raw_values and overlapping_genes_raw. Bare Infinity/-Infinity/NaN numeric tokens are explicit {nonfinite: token} objects; _enrichr_transport retains exact native text, SHA-256 and token offsets. Never treat these markers as zero/null/finite values. " +
    "Return entire API objects or staging/error handles. No .data wrapper. Results over 30 KiB stage automatically.",
	endpoints: [
    ...additionalEndpoints,
		{
			method: "POST",
			path: "/addList",
			summary:
				"Submit a gene list for enrichment analysis. Returns a userListId for subsequent queries.",
			description:
				"Body fields: list (string, required — newline-separated gene symbols) and description (string, optional). " +
				"Returns {shortId: string, userListId: number}.",
			category: "submission",
			body: {
				contentType: "multipart/form-data",
				description:
					'{"list": "BRCA1\\nTP53\\nEGFR\\nMYC", "description": "my query"}',
			},
			usageHint:
				"Use api.post('/addList', {list: 'BRCA1\\nTP53\\nEGFR\\nMYC', description: 'my query'}). " +
				"The list parameter is newline-separated gene symbols. Returns {shortId, userListId}.",
			example:
				"return await api.post('/addList', {list: 'BRCA1\\nTP53\\nEGFR\\nMYC', description: 'tumor suppressors'});",
		},
		{
			method: "GET",
			path: "/view",
			summary:
				"Retrieve the submitted gene list by userListId. Returns genes and description.",
			category: "submission",
			queryParams: [
				{
					name: "userListId",
					type: "number",
					required: true,
					description: "User list ID returned from /addList",
				},
			],
			example:
				"return await api.get('/view', {userListId: 12345});",
		},
		{
			method: "GET",
			path: "/enrich",
			summary:
				"Run enrichment analysis against a specific gene set library. Results are transformed from positional arrays into named objects.",
			description:
				"Requires a userListId from /addList. backgroundType is the library name (e.g. 'KEGG_2021_Human'). " +
				"The adapter transforms the raw array format into objects with: rank, term_name, p_value, odds_ratio (legacy z_score alias), " +
				"combined_score, overlapping_genes, adjusted_p_value, raw_values and overlapping_genes_raw. Results keyed by exact library name; _enrichr preserves metadata/context.",
			category: "enrichment",
			queryParams: [
        { name: "expected_library_sha256", type: "string", required: false, description: "Adapter-only GMT content digest from /libraries/snapshot; checked before and after analysis. Does not guarantee an atomic provider snapshot." },
				{
					name: "userListId",
					type: "number",
					required: true,
					description: "User list ID returned from /addList",
				},
				{
					name: "backgroundType",
					type: "string",
					required: true,
					description:
						"Gene set library name (e.g. 'KEGG_2021_Human', 'GO_Biological_Process_2023', 'WikiPathway_2023_Human')",
				},
			],
			example:
				"return await api.get('/enrich', {userListId: 12345, backgroundType: 'KEGG_2021_Human'});",
		},
		{
			method: "GET",
			path: "/datasetStatistics",
			summary:
				"List all available gene set libraries with metadata including name, number of terms, gene coverage, and category.",
			description:
				"Returns {statistics: [{libraryName, numTerms, geneCoverage, genesPerTerm, link, appyter, categoryId, ...}]}. " +
				"Use this to discover available library names for the /enrich endpoint.",
			category: "libraries",
			example:
				"return await api.get('/datasetStatistics');",
		},
	],
};
