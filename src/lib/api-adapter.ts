import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { enrichrFetch, enrichrAddList } from "./http";

export function createEnrichrApiFetch(): ApiFetchFn {
	return async (request) => {
		const path = request.path;

		// POST /addList — multipart form submission
		if (path === "/addList" && request.body) {
			const body = request.body as Record<string, unknown>;
			const genes = ((body.list as string) || "")
				.split("\n")
				.filter(Boolean);
			const description = (body.description as string) || "mcp-query";
			const response = await enrichrAddList(genes, description);
			if (!response.ok) {
				const text = await response.text();
				const error = new Error(
					`HTTP ${response.status}: ${text.slice(0, 200)}`,
				) as Error & { status: number; data: unknown };
				error.status = response.status;
				error.data = text;
				throw error;
			}
			const data = await response.json();
			return { status: response.status, data };
		}

		// All other requests — standard GET
		const response = await enrichrFetch(path, request.params);
		if (!response.ok) {
			let errorBody: string;
			try {
				errorBody = await response.text();
			} catch {
				errorBody = response.statusText;
			}
			const error = new Error(
				`HTTP ${response.status}: ${errorBody.slice(0, 200)}`,
			) as Error & { status: number; data: unknown };
			error.status = response.status;
			error.data = errorBody;
			throw error;
		}

		// Enrichr may not set Content-Type header — try JSON parse first
		const text = await response.text();
		let data: unknown;
		try {
			data = JSON.parse(text);
		} catch {
			return { status: response.status, data: text };
		}

		// Transform enrichment results from positional arrays to named objects
		if (path.startsWith("/enrich") && data && typeof data === "object") {
			const transformed: Record<string, unknown[]> = {};
			for (const [library, terms] of Object.entries(
				data as Record<string, unknown[][]>,
			)) {
				if (Array.isArray(terms)) {
					transformed[library] = terms.map((t: unknown[]) => ({
						rank: t[0],
						term_name: t[1],
						p_value: t[2],
						z_score: t[3],
						combined_score: t[4],
						overlapping_genes: Array.isArray(t[5])
							? (t[5] as string[]).join(", ")
							: t[5],
						adjusted_p_value: t[6],
						old_p_value: t[7],
						old_adjusted_p_value: t[8],
					}));
				}
			}
			data = transformed;
		}

		return { status: response.status, data };
	};
}
