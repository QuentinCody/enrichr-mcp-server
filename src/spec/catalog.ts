import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";

export const enrichrCatalog: ApiCatalog = {
	name: "Enrichr",
	baseUrl: "https://maayanlab.cloud/Enrichr",
	version: "3.0",
	auth: "none",
	endpointCount: 4,
	notes:
		"- Gene set enrichment analysis tool from Ma'ayan Lab\n" +
		"- 225+ gene set libraries organized in 8 categories (pathways, ontologies, diseases, drugs, cell types, transcription, legacy)\n" +
		"- Workflow: POST /addList to submit genes → get userListId → GET /enrich with library name\n" +
		"- For /addList via Code Mode: use api.post('/addList', {list: 'BRCA1\\nTP53\\nEGFR', description: 'my genes'})\n" +
		"- The adapter transforms /enrich array results into named objects with rank, term_name, p_value, z_score, combined_score, overlapping_genes, adjusted_p_value\n" +
		"- Key libraries: KEGG_2021_Human, GO_Biological_Process_2023, GO_Molecular_Function_2023, GO_Cellular_Component_2023\n" +
		"- WikiPathway_2023_Human, Reactome_2022, BioPlanet_2019\n" +
		"- Drug/perturbation: LINCS_L1000_Chem_Pert_Consensus_Sigs, DSigDB, Drug_Perturbations_from_GEO_down/up\n" +
		"- Disease: DisGeNET, OMIM_Disease, Jensen_DISEASES, ClinVar_2019\n" +
		"- Cell type: CellMarker_2024, PanglaoDB_Augmented_2021, Tabula_Sapiens\n" +
		"- Transcription: ENCODE_and_ChEA_Consensus_TFs, ChEA_2022, TRRUST_Transcription_Factors_2019\n" +
		"- CRISPR: CRISPRi_Perturbations, PerturbAtlas_2025\n" +
		"- No authentication required, no documented rate limits\n" +
		"- Results can be very large for some libraries (33K+ terms for LINCS) — will be auto-staged",
	endpoints: [
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
				"const result = await api.post('/addList', {list: 'BRCA1\\nTP53\\nEGFR\\nMYC', description: 'tumor suppressors'});",
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
				"const genes = await api.get('/view', {userListId: 12345});",
		},
		{
			method: "GET",
			path: "/enrich",
			summary:
				"Run enrichment analysis against a specific gene set library. Results are transformed from positional arrays into named objects.",
			description:
				"Requires a userListId from /addList. backgroundType is the library name (e.g. 'KEGG_2021_Human'). " +
				"The adapter transforms the raw array format into objects with: rank, term_name, p_value, z_score, " +
				"combined_score, overlapping_genes, adjusted_p_value. Results keyed by library name.",
			category: "enrichment",
			queryParams: [
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
				"const enrichment = await api.get('/enrich', {userListId: 12345, backgroundType: 'KEGG_2021_Human'});",
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
				"const stats = await api.get('/datasetStatistics');",
		},
	],
};
