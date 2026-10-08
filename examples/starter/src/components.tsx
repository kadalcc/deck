import type { ComponentType } from "react";

/**
 * Components your slides can use without importing: `<MyChart />` in deck.mdx resolves here.
 * Add a `layout:name` entry to register a custom layout for `layout: name` in frontmatter.
 */
export const components: Record<string, ComponentType<Record<string, unknown>>> = {};
