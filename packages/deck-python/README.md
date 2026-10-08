# @kadal/deck-python

Python islands on a deck slide, through Pyodide — CPython compiled to WebAssembly.

```ts
registerLazyRenderer("python", () => import("@kadal/deck-python").then((m) => m.pythonRenderer));
```

```python
# ticker.py
def deck_mount(host, props):
    return Ticker(host, props)       # with deck_update(props) and deck_destroy()
```

```mdx
<Island
  framework="python"
  load={() => import("./ticker.py?raw").then((m) => deckPython(m.default))}
  props={{ data }}
/>
```

## A Python island is source text

Every other component in the engine is a value the bundler produced: an options object, a compiled
function, a class, a WASM module. **Python has no build step and no bundle** — CPython compiled to
WebAssembly reads source at runtime, exactly as it does on a server. So `<Island>` is handed a
*string*, `?raw` is the whole pipeline, and the renderer's work begins with `runPython`.

The contract's `IslandComponent` being `unknown` is what makes that legal, and this is the case that
justifies it. The engine never looks inside a component, so a component can be a file.

## Three things with no equivalent anywhere else in the engine

**1. `destroy` is a reserved word on this boundary.** `PyProxy.destroy()` is the proxy's own
lifetime method. A Python class with a method of that name is shadowed by it, so
`handle.destroy()` from JavaScript quietly frees the proxy and **never runs the island's teardown** —
the interval keeps ticking behind nineteen slides and nothing reports a thing. The agreement is
therefore `deck_mount`, `deck_update` and `deck_destroy`. Snake_case, which is what Python wanted.

**2. Proxies must be freed by hand.** Garbage collection cannot cross the boundary in either
direction: the JavaScript collector does not know the Python object exists, and Python's does not
know JavaScript is holding it. Every proxy the renderer takes — the handle, each bound method, the
namespace — is released explicitly. Forget one and the leak is in WASM linear memory, where no
browser tool will show it to you. The same applies inside the island: a `create_proxy` callback
handed to `setInterval` has to be destroyed when the island is.

**3. Property access is not `.get()`.** A PyProxy of a *dict* has `.get`; a proxy of a class
instance does not — its methods are properties, and each read mints a new bound-method proxy. Which
is why the renderer reads them once and keeps them.

## One interpreter, shared

Pyodide is a **six-megabyte download** and a second or two of startup — the most expensive thing in
this engine by two orders of magnitude. It is fetched once, lazily, from a pinned jsDelivr URL,
shared by every Python island on the deck, and deliberately *not* torn down when the last island
leaves: reclaiming the memory would make the next Python slide pay the six megabytes again, and a
deck with one Python island usually has two.

Each island still runs in **its own namespace** `dict`. A shared interpreter means a shared global
namespace, and two islands both defining `deck_mount` would silently be the same island twice.

## It needs the network

Pyodide is loaded from `https://cdn.jsdelivr.net/pyodide/v<pinned>/full/`. The version is pinned
because an interpreter that changes under a deck is a presentation that breaks on stage. A deck
presented offline cannot run a Python island unless it serves Pyodide itself — pass
`setPyodideIndexUrl()` for that.

On the showcase slide, the Python ticker reads a few seconds behind the other nine. That is not a
bug: it is the download, visible.

## Licence

AGPL-3.0-or-later, with a commercial licence available — the same terms as the engine. See
[LICENSING.md](../deck/LICENSING.md).
