import type { TypeVariant, ValueShape } from "../catalog/types.ts";

/** The JSON type of a value, as the catalog names types. */
export function typeOfValue(v: unknown): TypeVariant["type"] {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  const t = typeof v;
  return t === "string" || t === "number" || t === "boolean" ? t : "object";
}

/**
 * Does `value` fit `shape`? Returns null when it does, else a short reason. Numbers written as
 * strings ("3") pass where a number is expected, as the engine accepts them.
 */
export function checkValue(shape: ValueShape, value: unknown): string | null {
  if (!shape.variants.length) return null;
  const t = typeOfValue(value);
  for (const v of shape.variants) {
    if (v.type === "number" && t === "string" && /^-?\d+(\.\d+)?$/.test(String(value)) && !v.enum)
      return null;
    if (v.type !== t) continue;
    if (v.enum && !v.enum.includes(value as never)) continue;
    if (v.type === "object" && v.properties && value && typeof value === "object") {
      for (const [k, sub] of Object.entries(value as Record<string, unknown>)) {
        const p = v.properties[k];
        if (!p) continue;
        const why = checkValue(p, sub);
        if (why) return `${k}: ${why}`;
      }
    }
    return null;
  }
  const enums = shape.variants.flatMap((v) => v.enum ?? []);
  const open = shape.variants.filter((v) => !v.enum).map((v) => v.type);
  const expected = [...open, ...enums.map((e) => JSON.stringify(e))].join(" | ");
  return `expected ${expected || shape.text}, got ${t === "string" ? JSON.stringify(value) : t}`;
}

/** The closest name in a list (for "did you mean"), or null when nothing is near. */
export function closest(name: string, options: Iterable<string>): string | null {
  const a = name.toLowerCase();
  let best: string | null = null;
  let bestD = Infinity;
  for (const o of options) {
    const d = distance(a, o.toLowerCase());
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best !== null && bestD <= Math.max(2, Math.floor(a.length / 3)) ? best : null;
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length]!;
}
