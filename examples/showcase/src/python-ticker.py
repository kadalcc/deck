"""A Python island on a slide, for the islands tour.

Nothing here is adapted for the deck beyond `deck_mount`, which is the agreement. This is CPython,
compiled to WebAssembly, reading this file as source at the moment the slide comes up — there is no
build step and no bundle, which is why the island's "component" is a string.

`js` is Pyodide's bridge to the host: `js.document` is the real document, and `create_proxy` makes a
Python callable that JavaScript can hold on to. That proxy has to be destroyed by hand, because
garbage collection does not cross the boundary in either direction.

The methods are `deck_update` and `deck_destroy` rather than `update` and `destroy`, because
`PyProxy.destroy()` is the proxy's own lifetime method and would shadow a Python one of that name.
"""

import js
from pyodide.ffi import create_proxy


def _tally(which):
    """The counter the deck's island verifier reads, so this island is checked by the same script.

    `getattr` with a default, not plain attribute access: Pyodide raises AttributeError for a
    property the host object does not have, where JavaScript would hand back `undefined`. The
    first island on a fresh page is exactly that case, and the traceback it produced came from
    inside a constructor that had already built the DOM — so the island painted, ticked, and was
    reported as failed, all at once.
    """
    counts = getattr(js.window, "__pythonIsland", None)
    if counts is None:
        counts = js.JSON.parse('{"mounted": 0, "destroyed": 0}')
        js.window.__pythonIsland = counts
    setattr(counts, which, getattr(counts, which) + 1)


class Ticker:
    """The handle the renderer holds: update and destroy, and nothing else."""

    def __init__(self, host, props):
        self.host = host
        self.ticks = 0

        self.box = js.document.createElement("div")
        self.box.className = "ticker is-python"

        self.label = js.document.createElement("span")
        self.label.className = "ticker-label"
        self.count = js.document.createElement("strong")
        self.count.className = "ticker-count"
        self.step_line = js.document.createElement("em")
        self.step_line.className = "ticker-step"

        self.box.append(self.label, self.count, self.step_line)
        host.replaceChildren(self.box)

        self.step = 0
        self.deck_update(props)

        # A Python callable JavaScript can hold. Kept on self so destroy() can free it.
        self._tick_proxy = create_proxy(self._tick)
        self._timer = js.setInterval(self._tick_proxy, 100)
        _tally("mounted")

    def _tick(self, *_):
        self.ticks += 1
        self._paint()

    def _paint(self):
        self.box.dataset.pythonTicks = str(self.ticks)
        self.box.dataset.pythonStep = str(self.step)
        self.count.textContent = f"{self.ticks // 10}.{self.ticks % 10}s"
        self.step_line.textContent = f"deck click {self.step}"

    def deck_update(self, props):
        """New props without a teardown — the tick count survives, like every other island here.

        Named `deck_update` for symmetry with `deck_destroy`, which has to be called that: see
        below.
        """
        values = props.to_py() if hasattr(props, "to_py") else props
        self.label.textContent = values.get("label", "a python island")
        self.step = int(values.get("step", 0))
        self._paint()

    def deck_destroy(self):
        """Not `destroy`. `PyProxy.destroy()` is the proxy's own lifetime method, so a method of
        that name is shadowed by it — JavaScript calling `handle.destroy()` would free the proxy
        and never run this, leaving the interval ticking behind nineteen slides in silence."""
        js.clearInterval(self._timer)
        self._tick_proxy.destroy()
        self.host.replaceChildren()
        _tally("destroyed")


def deck_mount(host, props):
    """What @kadal/deck-python calls. The whole integration surface."""
    return Ticker(host, props)
