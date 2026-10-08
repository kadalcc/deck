# @kadal/deck-angular

Angular standalone components on a deck slide — zoneless, JIT, and with **no Angular build plugin**.

```ts
// once, where the deck is created
registerLazyRenderer("angular", () =>
  import("@kadal/deck-angular").then((m) => m.angularRenderer),
);
```

```ts
// chart.angular.ts
@Component({ selector: "deck-chart", standalone: true, template: `…` })
export class Chart {
  @Input() data: number[] = [];
}
deckAngular(Chart);
```

```mdx
<Island load={() => import("./chart.angular.ts").then((m) => m.Chart)} props={{ data }} />
```

The deck's `tsconfig` needs `experimentalDecorators: true` and `useDefineForClassFields: false`.
That is the whole build configuration.

## Angular expects to be an application

Every other renderer takes a component and puts it in an element. This one has to stand up an
Angular *application* first — a component with no injector, no change-detection scheduler and no
zone has nothing to run inside. `createApplication()` is a whole runtime's worth of setup, and a
deck can hold several Angular islands at once across the stage, the presenter's current-slide box
and an overview tile. So the application is **created once, shared, and reference-counted**: the
last island to leave destroys it.

## Four things that each cost a run to find

**1. No Analog plugin.** Angular's Vite story is `@analogjs/vite-plugin-angular`. Pointed at one
file inside a deck — `transformFilter` scoped, its own tsconfig — it emitted an **empty module**:
the component vanished from the bundle and the island sat on its fallback for ever, with no error.
The plugin is built for an Angular application, and a deck is not one. The renderer takes Angular's
other documented route instead and imports `@angular/compiler`, which is exactly what Angular's own
error message recommends.

**2. `import "@angular/compiler"` must be first.** Angular's packages are published *partially
compiled*; their `ɵɵngDeclare*` calls need either the Angular Linker at build time or that compiler
at runtime. Loading it registers the compiler facade — and `@angular/platform-browser` reads that
facade in a **static initializer**, which runs the instant the module is evaluated. Import it
second and you get "`@angular/compiler` is not available" from a module that imported it ten lines
earlier. It sorts before `@angular/core` alphabetically, so a sorted import block keeps it right.

**3. Signal inputs need AOT. Use `@Input()`.** `input()` signal inputs are discovered by Angular's
AOT compiler reading the initializer *statically*. Under JIT no such analysis happens: the component
mounts and runs perfectly, and then `ref.setInput("step", 1)` fails with **NG0303**, and the island
shows the props it was born with for ever. Internal state can still be a `signal()` — signals need
no compiler, and they are what makes change detection run in a zoneless application.

**4. `setInput`, never `ref.instance.x = y`.** Only `setInput` marks the view dirty so change
detection actually runs. It also throws for an input the component never declared, so each key is
set independently and an unknown one is reported rather than taking the island down.

## Zoneless, deliberately

zone.js monkey-patches every async API in the page to know when to run change detection. A deck is
not an Angular app that happens to contain other things; it is six other frameworks that happen to
contain an Angular island, and patching `setTimeout` for all of them to serve one is the wrong
trade. `provideZonelessChangeDetection()` means signals schedule their own change detection, the
island gets what it needs, and nothing outside it is touched.

## Mount is asynchronous

`createApplication()` returns a promise, so like Qwik this renderer hands back its `IslandMount`
before anything is on screen. A presenter who leaves the slide before Angular finishes starting is
handled by a flag the startup checks; props that arrive in the meantime are kept and applied when
the application lands.

## Licence

AGPL-3.0-or-later, with a commercial licence available — the same terms as the engine. See
[LICENSING.md](../deck/LICENSING.md).
