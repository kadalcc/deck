// FIRST, and it has to be first.
//
// Angular's packages are published *partially compiled*: their `ɵɵngDeclare*` calls need either the
// Angular Linker at build time or this compiler at runtime. Loading it registers the compiler
// facade — and `@angular/platform-browser` reads that facade in a *static initializer*, which runs
// the moment the module is evaluated. Import this second and the error is
// "`@angular/compiler` is not available" from a module that imported it ten lines earlier.
//
// It sorts before "@angular/core" alphabetically, so the formatter leaves it here.
import "@angular/compiler";
import {
  type ApplicationRef,
  type ComponentRef,
  type Type,
  createComponent,
  provideZonelessChangeDetection,
} from "@angular/core";
import { createApplication } from "@angular/platform-browser";
import {
  type DeckRenderer,
  type IslandComponent,
  type IslandProps,
  type RenderContext,
} from "@kadal/deck/renderers/contract";

export { deckAngular, deckAngularFiles, isDeckAngularFile } from "./build.ts";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ANGULAR RENDERER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Angular is the only framework here that expects to be an application rather than a component.
 * Every other renderer takes a component and puts it in an element; this one has to stand up an
 * Angular *application* first, because a component with no injector, no change-detection scheduler
 * and no zone has nothing to run inside.
 *
 * ONE APPLICATION, SHARED, REFERENCE-COUNTED. `createApplication()` is not free — it is a whole
 * runtime's worth of setup — and a deck can hold several Angular islands at once across the stage,
 * the presenter's current-slide box and an overview tile. So the application is created once,
 * lazily, and handed to every island; the last island to leave destroys it. Creating one per island
 * works and is wasteful enough to notice on a slide change.
 *
 * INPUTS, NOT PROPERTIES. `ref.setInput(name, value)` is the only correct way to hand an Angular
 * component new props: it marks the view dirty so change detection actually runs, which assigning
 * to `ref.instance.name` does not. It also throws for a name the component never declared, so each
 * key is set independently and an unknown one is reported rather than taking the island down.
 *
 * ASYNCHRONOUS MOUNT, AGAIN. `createApplication()` returns a promise, so like Qwik this renderer
 * hands back its `IslandMount` before anything is on screen. The contract asking for the handle
 * synchronously is what makes that safe.
 *
 * NO ANGULAR BUILD PLUGIN. Angular's Vite story is Analog's plugin, and pointed at one file inside
 * a deck it emitted an empty module — the component vanished from the bundle and the island sat on
 * its fallback for ever. The plugin is built for an Angular application and a deck is not one. So
 * this renderer takes the other documented route and imports `@angular/compiler`, which is exactly
 * what Angular's own error message recommends when a partially-compiled library meets a build that
 * has not run the linker. The compiler is ~40 kB gzipped and rides in the island's chunk, so it is
 * fetched only by a slide that actually has an Angular island on it — which is the same bargain
 * every other framework here makes.
 *
 * ZONELESS, DELIBERATELY. zone.js monkey-patches every async API in the page to know when to run
 * change detection. A deck is not an Angular app that happens to contain other things; it is four
 * other frameworks that happen to contain an Angular island, and patching `setTimeout` for all of
 * them to serve one is the wrong trade. Signals schedule their own change detection, so the island
 * gets what it needs and nothing outside it is touched.
 *
 * SIGNAL INPUTS MEAN NO DECORATED FIELDS. An island component needs exactly one decorator, the
 * `@Component` on the class; its inputs are `input()` signals. That matters because decorators are
 * the part of Angular that needs build configuration, and one class decorator is the smallest
 * amount of it a deck can get away with.
 */

/* ── the shared application ───────────────────────────────────────────────── */

let shared: Promise<ApplicationRef> | null = null;
let islands = 0;

function acquire(): Promise<ApplicationRef> {
  islands++;
  // Zoneless, deliberately. zone.js is a global monkey-patch of every async API in the page, and a
  // deck is not an Angular app that happens to contain other things — it is four other frameworks
  // that happen to contain an Angular island. Signals schedule change detection on their own.
  shared ??= createApplication({ providers: [provideZonelessChangeDetection()] });
  return shared;
}

function releaseWhenLast(app: ApplicationRef | null): void {
  islands--;
  if (islands > 0 || !app) return;
  shared = null;
  app.destroy();
}

/** For tests, and for a deck that wants the runtime gone rather than idle. */
export function destroySharedAngularApplication(): void {
  const pending = shared;
  shared = null;
  islands = 0;
  void pending?.then((app) => app.destroy()).catch(() => {});
}

export const angularRenderer: DeckRenderer = {
  name: "angular",

  // No `owns`. An Angular component is a class with a compiler-generated static field, and so is
  // half of everything else; the contract's rule holds. See the header.

  mount(host: Element, component: IslandComponent, props: IslandProps, context: RenderContext) {
    const inputs = context.slot ? { ...props, deckSlot: context.slot } : { ...props };

    let gone = false;
    let app: ApplicationRef | null = null;
    let ref: ComponentRef<unknown> | null = null;
    let latest: IslandProps = inputs;

    const apply = (next: IslandProps) => {
      if (!ref) return;
      for (const [key, value] of Object.entries(next)) {
        try {
          // `setInput` marks the view dirty; assigning to `ref.instance` does not, and the island
          // would sit at the props it was born with while looking perfectly healthy.
          ref.setInput(key, value);
        } catch {
          console.warn(`[deck] angular island: “${key}” is not an input on this component`);
        }
      }
      ref.changeDetectorRef.detectChanges();
    };

    void acquire()
      .then((application) => {
        // The presenter can leave the slide before Angular finishes starting.
        if (gone) return;
        app = application;
        ref = createComponent(component as Type<unknown>, {
          environmentInjector: application.injector,
          hostElement: host,
        });
        apply(latest);
        application.attachView(ref.hostView);
        ref.changeDetectorRef.detectChanges();
      })
      .catch((error: unknown) => {
        console.error("[deck] angular island failed to mount:", error);
      });

    return {
      destroy() {
        if (gone) return;
        gone = true;
        ref?.destroy();
        ref = null;
        releaseWhenLast(app);
        app = null;
      },
      update(next: IslandProps) {
        if (gone) return;
        latest = context.slot ? { ...next, deckSlot: context.slot } : next;
        // Before the application resolves there is no view to mark; `latest` is read by the mount
        // when it lands, so a click during startup is not lost.
        apply(latest);
      },
    };
  },

  // No `ssr`. `@angular/platform-server` is a second platform package for a surface that does not
  // exist yet; the deck's print and export paths run a real browser.
};
