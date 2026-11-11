import { afterEach, expect, it, vi } from "vitest";
import { jsonResponse } from "./http";
import { readEnrichrResponse } from "./read-response";

afterEach(() => vi.useRealTimers());
it("bounds stalled bodies without awaiting stalled cancellation", async () => {
  vi.useFakeTimers();
  const response = new Response(new ReadableStream({ pull: () => new Promise(() => {}), cancel: () => new Promise(() => {}) }));
  const result = expect(readEnrichrResponse(response)).rejects.toMatchObject({ status: 504 });
  await vi.advanceTimersByTimeAsync(15001); await result;
});
it.each([200, 206])("rejects partial HTTP %s and preserves received evidence", async status => {
  await expect(jsonResponse(new Response("[]", { status, headers: { "content-range": "bytes 0-1/50" } })))
    .rejects.toMatchObject({ status: 502, data: { response: "[]", http_status: status, incomplete: true } });
});
it("rejects malformed UTF-8 and retains malformed JSON evidence", async () => {
  await expect(readEnrichrResponse(new Response(new Uint8Array([0xc3, 0x28])))).rejects.toThrow();
  await expect(jsonResponse(new Response("{broken"))).rejects.toMatchObject({ data: { response: "{broken" } });
});
