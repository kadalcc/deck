//! A Leptos island for the deck's islands tour.
//!
//! The point of this crate is that it contains no deck-specific machinery. It meets the
//! `@kadal/deck-wasm` ABI — a `deckMount` that takes an element and some props and returns a handle
//! with `update` and `destroy` — and everything else is ordinary Leptos. The same shape works for
//! Dioxus or Yew, because all three reach JavaScript through `wasm-bindgen` and that ABI is written
//! in terms of what `wasm-bindgen` can express.
//!
//! Two things here are not what a Leptos tutorial would show, and both come from the island being
//! driven from outside rather than from a router:
//!
//!   * **`ArcRwSignal`, not `RwSignal`.** The arena-allocated kind belongs to a reactive owner and
//!     is only valid inside one. These signals are created before `mount_to` runs and are read by
//!     JavaScript afterwards, which is exactly the lifetime the `Arc`-based signals exist for.
//!   * **`Box<dyn Any>` for the unmount handle.** `mount_to` returns `UnmountHandle<N::State>`,
//!     whose type depends on the view, and a `#[wasm_bindgen]` struct cannot carry a generic. Boxed
//!     as `Any`, dropping it still runs the real `Drop` and tears the view down.
//!
//! Build: `bun run rust` from `decks/showcase`.

use std::any::Any;

use leptos::prelude::*;
use serde::Deserialize;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{Element, HtmlElement};

#[derive(Deserialize, Default, Clone)]
#[serde(default)]
struct Props {
    label: String,
    step: i32,
}

/// The handle the renderer holds. `update` and `destroy` are the whole agreement.
#[wasm_bindgen]
pub struct TickerHandle {
    label: ArcRwSignal<String>,
    step: ArcRwSignal<i32>,
    unmount: Option<Box<dyn Any>>,
}

#[wasm_bindgen]
impl TickerHandle {
    /// New props without a teardown. These are the same signals the view is reading, so setting
    /// them re-runs only the parts of the view that read them — Leptos is fine-grained in the same
    /// way Solid is, which is not a coincidence.
    pub fn update(&self, props: JsValue) {
        let Ok(next) = serde_wasm_bindgen::from_value::<Props>(props) else {
            return;
        };
        self.label.set(if next.label.is_empty() {
            "a rust island".to_string()
        } else {
            next.label
        });
        self.step.set(next.step);
    }

    /// Tear down. Dropping the boxed handle runs Leptos's own `Drop`, which disposes the reactive
    /// graph and removes the DOM; the interval is stopped by the `on_cleanup` registered below.
    pub fn destroy(&mut self) {
        drop(self.unmount.take());
    }
}

/// What `@kadal/deck-wasm` calls. One attribute is the entire integration.
#[wasm_bindgen(js_name = deckMount)]
pub fn deck_mount(host: Element, props: JsValue) -> TickerHandle {
    let initial: Props = serde_wasm_bindgen::from_value(props).unwrap_or_default();

    let label = ArcRwSignal::new(if initial.label.is_empty() {
        "a rust island".to_string()
    } else {
        initial.label
    });
    let step = ArcRwSignal::new(initial.step);

    let parent: HtmlElement = host.unchecked_into();

    let view_label = label.clone();
    let view_step = step.clone();

    let unmount = leptos::mount::mount_to(parent, move || {
        let ticks = ArcRwSignal::new(0_i32);

        // The tally the deck's island verifier reads, so this island is checked by exactly the
        // same script as the nine beside it.
        tally("mounted");

        let bump = ticks.clone();
        let interval = set_interval_with_handle(
            move || bump.update(|n| *n += 1),
            std::time::Duration::from_millis(100),
        )
        .expect("interval");

        on_cleanup(move || {
            tally("destroyed");
            interval.clear();
        });

        let (t_attr, t_count) = (ticks.clone(), ticks.clone());
        let (s_attr, s_text) = (view_step.clone(), view_step.clone());
        let l = view_label.clone();

        view! {
            <div
                class="ticker is-rust"
                data-rust-ticks=move || t_attr.get().to_string()
                data-rust-step=move || s_attr.get().to_string()
            >
                <span class="ticker-label">{move || l.get()}</span>
                <strong class="ticker-count">
                    {move || format!("{}.{}s", t_count.get() / 10, t_count.get() % 10)}
                </strong>
                <em class="ticker-step">{move || format!("deck click {}", s_text.get())}</em>
            </div>
        }
    });

    TickerHandle {
        label,
        step,
        unmount: Some(Box::new(unmount)),
    }
}

#[wasm_bindgen(inline_js = "
export function tally(which) {
  const t = (window.__rustIsland ??= { mounted: 0, destroyed: 0 });
  t[which]++;
}
")]
extern "C" {
    fn tally(which: &str);
}
