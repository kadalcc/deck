import { registerRenderer } from "./contract.ts";
import { reactRenderer } from "./react.tsx";
import { webComponentsRenderer } from "./web-components.ts";

/**
 * The two that ship with the engine, in `owns()` order: custom elements can recognise their own
 * (a hyphenated tag is unambiguous), React cannot and does not try.
 */
export function registerBuiltinRenderers(): void {
  registerRenderer(webComponentsRenderer);
  registerRenderer(reactRenderer);
}
