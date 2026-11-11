import { expect, it } from "vitest";
import { digest, jsonResponse } from "./http";
import { parseEnrichmentJson } from "./nonfinite";

it("preserves bare nonfinite values distinctly from literal strings and null", async () => {
  const text = '{"Library":[[1,"Infinity \\" NaN",0.1,Infinity,-Infinity,["NaN"],NaN,null,{"future":true}]]}';
  const result = await jsonResponse(new Response(text), true);
  expect(result.Library).toEqual([[1, 'Infinity " NaN', 0.1, {nonfinite:"Infinity"}, {nonfinite:"-Infinity"}, ["NaN"], {nonfinite:"NaN"}, null, {future:true}]]);
  expect(result._enrichr_transport).toMatchObject({native_response:text,native_response_sha256:await digest(text)});
  expect(parseEnrichmentJson(text).tokens.map(t=>text.slice(t.offset_utf16,t.offset_utf16+t.token.length))).toEqual(["Infinity","-Infinity","NaN"]);
  await expect(jsonResponse(new Response(text))).rejects.toMatchObject({status:502,data:{response:text}});
});
it.each(['{"x":Infinityfoo}', '{Infinity:1}', '{"x":NaN()}', '{"x":undefined}', '{"x":+Infinity}', '{"x":"unterminated Infinity}'])
  ("rejects other malformed syntax without evaluating it: %s", text => { expect(()=>parseEnrichmentJson(text)).toThrow(); });
