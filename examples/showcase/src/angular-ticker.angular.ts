import { Component, Input, signal, type OnDestroy, type OnInit } from "@angular/core";

import { deckAngular } from "@kadal/deck-angular/build";

/**
 * An Angular component on a slide, for the islands tour.
 *
 * Inputs are `@Input()` fields, not `input()` signals, and that is not a style preference.
 * **Signal inputs are discovered by Angular's AOT compiler reading the `input()` initializer
 * statically.** This deck compiles Angular at runtime with the JIT compiler, where no such analysis
 * happens — the component mounts and runs, and then `ref.setInput("step", 1)` fails with NG0303,
 * "make sure that the property is declared as an input". The island looks completely healthy and
 * shows the props it was born with for ever.
 *
 * Internal state is still a signal: `signal()` needs no compiler at all, and it is what makes
 * change detection run in a zoneless application when the interval ticks.
 */

declare global {
  interface Window {
    __angularIsland?: { mounted: number; destroyed: number };
  }
}

@Component({
  selector: "deck-angular-ticker",
  standalone: true,
  template: `
    <div
      class="ticker is-angular"
      [attr.data-angular-ticks]="ticks()"
      [attr.data-angular-step]="step"
    >
      <span class="ticker-label">{{ label }}</span>
      <strong class="ticker-count">{{ (ticks() / 10).toFixed(1) }}s</strong>
      <em class="ticker-step">deck click {{ step }}</em>
    </div>
  `,
})
export class AngularTicker implements OnInit, OnDestroy {
  @Input() label = "an angular island";
  @Input() step = 0;

  readonly ticks = signal(0);

  #timer = 0;

  ngOnInit(): void {
    const tally = (window.__angularIsland ??= { mounted: 0, destroyed: 0 });
    tally.mounted++;
    this.#timer = window.setInterval(() => this.ticks.update((n) => n + 1), 100);
  }

  ngOnDestroy(): void {
    (window.__angularIsland ??= { mounted: 0, destroyed: 0 }).destroyed++;
    clearInterval(this.#timer);
  }
}

deckAngular(AngularTicker);
