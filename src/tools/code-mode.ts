import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import type { McpServer } from "@bio-mcp/shared/mcp";
import { createEnrichrApiFetch } from "../lib/api-adapter";
import { enrichrResponse } from "../lib/tool-result";
import { enrichrCatalog } from "../spec/catalog";

interface CodeModeEnv {
	ENRICHR_DATA_DO: DurableObjectNamespace;
	CODE_MODE_LOADER: WorkerLoader;
}

export function registerCodeMode(
	server: McpServer,
	env: CodeModeEnv,
): void {
	const apiFetch = createEnrichrApiFetch();
  const registrar = { tool: (...args: unknown[]) => {
    const [name, ...rest] = args;
    const handler = rest.pop() as (args: unknown, extra: unknown) => ReturnType<Parameters<typeof enrichrResponse>[0]>;
    const respond = (args: unknown, extra: unknown) => enrichrResponse(() => handler(args, extra), env, String(name), extra, args);
    const register = server.tool.bind(server) as (...values: unknown[]) => void;
    register(name, ...rest, respond);
    register(`mcp_${String(name)}`, ...rest, respond);
  } };

	const searchTool = createSearchTool({
		prefix: "enrichr",
		catalog: enrichrCatalog,
	});
	searchTool.register(registrar);

	const executeTool = createExecuteTool({
		prefix: "enrichr",
		// Verifiable provenance: enrichr_execute results carry a _meta.citation.
		source: { id: "enrichr", name: "Enrichr", url: "https://maayanlab.cloud/Enrichr" },
		catalog: enrichrCatalog,
		apiFetch,
    preserveApiErrors: true,
    stagingThreshold: 30 * 1024,
    maxInlineBytes: 30 * 1024,
    timeout: 90_000,
		doNamespace: env.ENRICHR_DATA_DO,
		loader: env.CODE_MODE_LOADER,
	});
	executeTool.register(registrar);
}
