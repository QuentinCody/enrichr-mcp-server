import { RestStagingDO } from "@bio-mcp/shared/staging/rest-staging-do";
import { flattenObject, type SchemaHints } from "@bio-mcp/shared/staging/schema-inference";

type Row = Record<string, unknown>;
const record = (value: unknown): value is Row => value !== null && typeof value === "object" && !Array.isArray(value);
const row = (value: unknown, index: number): Row => ({
  ...(record(value) ? { ...flattenObject(value, 2), ...Object.fromEntries(Object.entries(value).map(([key, item]) =>
    [key, item !== null && typeof item === "object" ? JSON.stringify(item) : item])) } : { value }),
  native_json: JSON.stringify(value), source_index: index,
});

/** Preserve native arrays, GMT bytes and backend-specific context without cross-products. */
export class EnrichrDataDO extends RestStagingDO {
  protected getTabularData(value: unknown): unknown {
    const data = record(value) && Array.isArray(value.content) && record(value.structuredContent) && "data" in value.structuredContent
      ? value.structuredContent.data : value;
    if (Array.isArray(data)) return { native_records: data.map(row) };
    if (!record(data)) return data;
    if (typeof data.sql === "string" && Array.isArray(data.rows)) return { query_rows: data.rows.map(row) };
    if (typeof data.content === "string" && typeof data.library_sha256 === "string") {
      const {content, ...context} = data;
      return {
        library_snapshot: [{ libraryName: data.libraryName, library_sha256: data.library_sha256, term_count: data.term_count, source_url: data.source_url }],
        snapshot_lines: content.split(/(?<=\n)/).filter(line => line.length > 0).map((line, index) => ({ line_index: index, native_line: line })),
        response_context: [{ native_json: JSON.stringify(context) }],
      };
    }
    const tables: Record<string, Row[]> = {};
    const context: Row = {};
    for (const [key, values] of Object.entries(data)) {
      if (Array.isArray(values) && key === "statistics") tables.library_stats = values.map(row);
      else if (Array.isArray(values) && key === "categories") tables.library_categories = values.map(row);
      else if (Array.isArray(values) && key === "genes") tables.gene_list = values.map(row);
      else if (Array.isArray(values) && values.every(item => record(item) && Array.isArray(item.raw_values))) {
        tables.enrichment_results ??= [];
        tables.enrichment_results.push(...values.map((item, index) => ({ ...row(item, index), library_name: key })));
      } else context[key] = values;
    }
    tables.response_context = [{ native_json: JSON.stringify(context) }];
    if (Object.keys(tables).length === 1) tables.native_objects = [row(data, 0)];
    return tables;
  }

  protected getSchemaHints(value: unknown): SchemaHints {
    const tables = this.getTabularData(value);
    const columnTypes: Record<string, string> = { native_json: "TEXT", native_line: "TEXT", library_name: "TEXT", library_sha256: "TEXT" };
    if (record(tables)) for (const values of Object.values(tables)) {
      if (!Array.isArray(values)) continue;
      for (const item of values) if (record(item)) for (const [key, value] of Object.entries(item)) {
        if (typeof value === "string") columnTypes[key] = "TEXT";
      }
    }
    return { columnTypes };
  }
}
