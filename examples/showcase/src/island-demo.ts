/**
 * A custom element with no framework behind it, for the islands slide.
 *
 * It is deliberately the plainest thing that can prove an island is alive: it counts, which only a
 * running timer can do, and it keeps a tally on `window` of how many times it has been connected
 * and disconnected — so a test can assert that leaving the slide really does tear it down rather
 * than leave a timer running behind nineteen other slides.
 */

declare global {
  interface Window {
    __islandDemo?: { mounted: number; destroyed: number };
  }
}

const tally = () => (window.__islandDemo ??= { mounted: 0, destroyed: 0 });

export class ShowcaseTicker extends HTMLElement {
  static tagName = "showcase-ticker";
  /** The deck's click arrives as an attribute, because that is all a custom element has. */
  static observedAttributes = ["label", "step"];
  #timer = 0;
  #ticks = 0;

  connectedCallback() {
    tally().mounted++;
    this.#render();
    this.#timer = window.setInterval(() => {
      this.#ticks++;
      this.#render();
    }, 100);
  }

  attributeChangedCallback() {
    // New props without a teardown — the same promise every other renderer here makes, kept by the
    // platform's own mechanism rather than by a framework.
    if (this.#timer) this.#render();
  }

  disconnectedCallback() {
    tally().destroyed++;
    clearInterval(this.#timer);
    this.#timer = 0;
  }

  #render() {
    const label = this.getAttribute("label") ?? "alive for";
    const step = this.getAttribute("step") ?? "0";
    this.innerHTML = `
      <div class="ticker" data-ce-ticks="${this.#ticks}" data-ce-step="${step}">
        <span class="ticker-label">${label}</span>
        <strong class="ticker-count">${(this.#ticks / 10).toFixed(1)}s</strong>
        <em class="ticker-step">deck click ${step}</em>
      </div>`;
  }
}

if (!customElements.get(ShowcaseTicker.tagName)) {
  customElements.define(ShowcaseTicker.tagName, ShowcaseTicker);
}
