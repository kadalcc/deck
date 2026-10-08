/** A slide's MDX reduced to searchable text: no tags, no fence noise, no attribute braces. */
export function plainText(mdx: string): string {
  return mdx
    .replace(/```[^\n]*\n?/g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#*_`>~|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
