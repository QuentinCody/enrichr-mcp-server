import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { enrichrCatalog } from "../spec/catalog";
import { createEnrichrApiFetch } from "../lib/api-adapter";

interface CodeModeEnv {
	ENRICHR_DATA_DO: DurableObjectNamespace;
	CODE_MODE_LOADER: WorkerLoader;
}

export function registerCodeMode(server: McpServer, env: CodeModeEnv): void {
	const apiFetch = createEnrichrApiFetch();

	const searchTool = createSearchTool({
		prefix: "enrichr",
		catalog: enrichrCatalog,
	});
	searchTool.register(
		server as unknown as { tool: (...args: unknown[]) => void },
	);

	const executeTool = createExecuteTool({
		prefix: "enrichr",
		catalog: enrichrCatalog,
		apiFetch,
		doNamespace: env.ENRICHR_DATA_DO,
		loader: env.CODE_MODE_LOADER,
	});
	executeTool.register(
		server as unknown as { tool: (...args: unknown[]) => void },
	);
}
