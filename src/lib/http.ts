import { restFetch } from "@bio-mcp/shared/http/rest-fetch";
import type { RestFetchOptions } from "@bio-mcp/shared/http/rest-fetch";

const ENRICHR_BASE = "https://maayanlab.cloud/Enrichr";

export interface EnrichrFetchOptions
	extends Omit<RestFetchOptions, "retryOn"> {
	baseUrl?: string;
}

export async function enrichrFetch(
	path: string,
	params?: Record<string, unknown>,
	opts?: EnrichrFetchOptions,
): Promise<Response> {
	const baseUrl = opts?.baseUrl ?? ENRICHR_BASE;
	return restFetch(baseUrl, path, params, {
		...opts,
		headers: { Accept: "application/json", ...(opts?.headers ?? {}) },
		retryOn: [429, 500, 502, 503],
		retries: opts?.retries ?? 3,
		timeout: opts?.timeout ?? 30_000,
		userAgent: "enrichr-mcp-server/1.0 (bio-mcp)",
	});
}

/**
 * POST a gene list to Enrichr using multipart form data.
 */
export async function enrichrAddList(
	genes: string[],
	description?: string,
	baseUrl?: string,
): Promise<Response> {
	const base = baseUrl ?? ENRICHR_BASE;
	const formData = new FormData();
	formData.append("list", genes.join("\n"));
	formData.append("description", description ?? "mcp-query");

	return fetch(`${base}/addList`, {
		method: "POST",
		body: formData,
		headers: {
			"User-Agent": "enrichr-mcp-server/1.0 (bio-mcp)",
		},
	});
}
