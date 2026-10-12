import { nothing, type TemplateResult } from "lit";

/**
 * Serialise a Lit template result to its markup, bindings inlined. happy-dom
 * drops Lit's child-part markers inside <svg>, so nested chart parts never
 * reach the DOM in tests; the template itself is what a browser renders, so
 * assert on it.
 */
export function flat(value: unknown): string {
  if (value === nothing || value === null || value === undefined || value === false) return "";
  if (Array.isArray(value)) return value.map(flat).join("");
  if (typeof value === "object" && "strings" in (value as object)) {
    const t = value as TemplateResult;
    return t.strings.reduce(
      (acc, s, i) => acc + s + (i < t.values.length ? flat(t.values[i]) : ""),
      ""
    );
  }
  return String(value);
}
