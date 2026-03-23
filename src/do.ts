import { RestStagingDO } from "@bio-mcp/shared/staging/rest-staging-do";
import type { SchemaHints } from "@bio-mcp/shared/staging/schema-inference";

export class EnrichrDataDO extends RestStagingDO {
	protected getSchemaHints(data: unknown): SchemaHints | undefined {
		if (!data || typeof data !== "object") return undefined;

		// Array data
		if (Array.isArray(data)) {
			const sample = data[0];
			if (sample && typeof sample === "object") {
				const s = sample as Record<string, unknown>;

				// Enrichment results: objects with rank, term_name, p_value
				if ("rank" in s && "term_name" in s && "p_value" in s) {
					return {
						tableName: "enrichment_results",
						indexes: ["rank", "term_name", "p_value", "adjusted_p_value", "combined_score"],
					};
				}

				// Library statistics: objects with libraryName, numTerms
				if ("libraryName" in s && "numTerms" in s) {
					return {
						tableName: "library_stats",
						indexes: ["libraryName", "numTerms", "geneCoverage", "categoryId"],
					};
				}

				// Gene list: array of strings
				if (typeof sample === "string") {
					return {
						tableName: "gene_list",
					};
				}
			}

			// Array of strings (gene names)
			if (typeof data[0] === "string") {
				return {
					tableName: "gene_list",
				};
			}
		}

		// Object with library keys (enrichment results grouped by library)
		const obj = data as Record<string, unknown>;
		const keys = Object.keys(obj);
		if (keys.length > 0) {
			const firstVal = obj[keys[0]];
			if (Array.isArray(firstVal) && firstVal.length > 0) {
				const sample = firstVal[0];
				if (sample && typeof sample === "object" && "rank" in sample) {
					return {
						tableName: "enrichment_results",
						indexes: ["rank", "term_name", "p_value", "adjusted_p_value", "combined_score"],
					};
				}
			}

			// Gene list view: {genes: string[], description: string}
			if ("genes" in obj && Array.isArray(obj.genes)) {
				return {
					tableName: "gene_list",
				};
			}

			// Dataset statistics: {statistics: [...]}
			if ("statistics" in obj && Array.isArray(obj.statistics)) {
				return {
					tableName: "library_stats",
					indexes: ["libraryName", "numTerms", "geneCoverage", "categoryId"],
				};
			}
		}

		return undefined;
	}
}
