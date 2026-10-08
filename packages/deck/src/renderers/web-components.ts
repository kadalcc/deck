import type { DeckRenderer, IslandComponent, IslandProps, RenderContext } from "./contract.ts";

/**
 * Custom elements — the renderer with no framework behind it.
 *
 * This one is first on purpose. Every other renderer will be a framework with opinions about
 * mounting, and it is easy to write a contract that quietly assumes the shape of the framework you
 * already have. Custom elements assume nothing: a tag name, an element, properties, `remove()`. If
 * the contract fits here it is a contract rather than React with extra steps.
 *
 * An author writes either the tag name:
 *
 *     <Island component="my-chart" props={{ data }} />
 *
 * or the class, which is defined on first use:
 *
 *     <Island component={MyChart} props={{ data }} />
 */

/** Tag names must contain a hyphen; that is the whole rule, and it makes recognition reliable. */
function isCustomElementName(value: unknown): value is string {
  return typeof value === "string" && value.includes("-") && !/\s/.test(value);
}

function isCustomElementClass(value: unknown): value is CustomElementConstructor {
  if (typeof value !== "function") return false;
  if (typeof HTMLElement === "undefined") return false;
  return value === HTMLElement || value.prototype instanceof HTMLElement;
}

let anonymous = 0;
const named = new WeakMap<CustomElementConstructor, string>();

/** The tag for a class: its own `tagName`, one it is already defined under, or a fresh one. */
function tagFor(ctor: CustomElementConstructor): string {
  const existing = named.get(ctor);
  if (existing) return existing;

  const declared = (ctor as { tagName?: unknown }).tagName;
  let tag = typeof declared === "string" && declared.includes("-") ? declared : "";
  if (!tag) tag = `deck-island-${++anonymous}`;

  const already = customElements.get(tag);
  if (!already) customElements.define(tag, ctor);
  else if (already !== ctor) {
    // Someone else owns that name. Give this class a name of its own rather than fight over it.
    tag = `deck-island-${++anonymous}`;
    customElements.define(tag, ctor);
  }
  named.set(ctor, tag);
  return tag;
}

/**
 * A property where the element has one, an attribute where it does not.
 *
 * This is the custom-element convention rather than a preference: rich values (arrays, objects,
 * functions) only survive as properties, and attributes only carry strings. `false` removes the
 * attribute instead of writing "false", which is what every element in HTML means by a boolean.
 */
function apply(el: Element, props: IslandProps): void {
  for (const [key, value] of Object.entries(props)) {
    if (key === "children") continue;
    const settable = key in el || typeof value === "object" || typeof value === "function";
    if (settable) {
      try {
        (el as unknown as Record<string, unknown>)[key] = value;
        continue;
      } catch {
        // A read-only property: fall through and try it as an attribute.
      }
    }
    if (value === false || value === null || value === undefined) el.removeAttribute(key);
    else if (value === true) el.setAttribute(key, "");
    else el.setAttribute(key, String(value));
  }
}

/**
 * `>` does not strictly need escaping inside a quoted attribute, and is escaped anyway: this string
 * is concatenated into markup that may be read somewhere less forgiving than a browser.
 */
function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export const webComponentsRenderer: DeckRenderer = {
  name: "web-components",

  owns(component: IslandComponent) {
    return isCustomElementName(component) || isCustomElementClass(component);
  },

  mount(host: Element, component: IslandComponent, props: IslandProps, context: RenderContext) {
    const tag = isCustomElementName(component)
      ? component
      : tagFor(component as CustomElementConstructor);

    const el = document.createElement(tag);
    // The slot goes in before the properties: an element that reads its own children on connect
    // should find them there.
    if (context.slot) el.innerHTML = context.slot;
    if (context.animate === false) el.setAttribute("data-still", "");
    apply(el, props);
    host.replaceChildren(el);

    return {
      destroy() {
        el.remove();
      },
      update(next: IslandProps) {
        apply(el, next);
      },
    };
  },

  /**
   * The element's markup without a browser to upgrade it. A custom element that has not been
   * defined is an inert tag with its attributes — which is exactly what a print page or an export
   * frame should show, as long as the element's styling does not depend on being upgraded.
   */
  ssr(component: IslandComponent, props: IslandProps, context: RenderContext) {
    const tag = isCustomElementName(component)
      ? component
      : typeof component === "function"
        ? tagFor(component as CustomElementConstructor)
        : "deck-island-unknown";
    const attrs = Object.entries(props)
      .filter(([k, v]) => k !== "children" && typeof v !== "object" && typeof v !== "function")
      .map(([k, v]) =>
        v === true
          ? ` ${k}=""`
          : v === false || v == null
            ? ""
            : ` ${k}="${escapeAttribute(String(v))}"`,
      )
      .join("");
    return `<${tag}${attrs}>${context.slot ?? ""}</${tag}>`;
  },
};
