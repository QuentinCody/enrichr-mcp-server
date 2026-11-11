/** Preserve native non-JSON numeric tokens explicitly; never execute provider text. */
export function parseEnrichmentJson(text: string) {
  const tokens: Array<{ offset_utf16: number; token: string }> = [];
  let converted = "";
  let start = 0;
  let previous = "";
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      index++;
      while (index < text.length && text[index] !== '"') {
        if (text[index] === "\\") index++;
        index++;
      }
      previous = '"';
      continue;
    }
    if (/[\s]/.test(char)) continue;
    const token = ["-Infinity", "Infinity", "NaN"].find(value => text.startsWith(value, index));
    if (token && "[:,".includes(previous) && /[\s,\]}]/.test(text[index + token.length] ?? "")) {
      converted += text.slice(start, index) + JSON.stringify({ nonfinite: token });
      tokens.push({ offset_utf16: index, token });
      index += token.length - 1;
      start = index + 1;
      previous = "v";
    } else previous = char;
  }
  return { value: JSON.parse(converted + text.slice(start)) as unknown, tokens };
}
