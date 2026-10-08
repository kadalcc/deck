;; The smallest island on the deck: a counter that is not JavaScript.
;;
;; WebAssembly cannot reach the DOM — the host object graph is not addressable from linear memory —
;; so this module holds the state and does the arithmetic, and the shim beside it does the painting.
;; That division is not a simplification for the demo: it is exactly what wasm-bindgen generates for
;; Leptos or Dioxus, written out by hand so the seam is visible.
(module
  ;; ticks at offset 0, the deck's click index at offset 4.
  (memory 1)

  (func $tick (result i32)
    (i32.store (i32.const 0) (i32.add (i32.load (i32.const 0)) (i32.const 1)))
    (i32.load (i32.const 0)))

  (func $ticks (result i32) (i32.load (i32.const 0)))

  (func $set_step (param $n i32) (i32.store (i32.const 4) (local.get $n)))

  (func $step (result i32) (i32.load (i32.const 4)))

  ;; Tenths, formatted the hard way: whole seconds and the remaining tenth, so the module is doing
  ;; the work the label shows rather than handing a raw count to JavaScript to divide.
  (func $whole (result i32) (i32.div_u (i32.load (i32.const 0)) (i32.const 10)))
  (func $tenth (result i32) (i32.rem_u (i32.load (i32.const 0)) (i32.const 10)))

  (func $reset (i32.store (i32.const 0) (i32.const 0)) (i32.store (i32.const 4) (i32.const 0)))

  (export "tick" (func $tick))
  (export "ticks" (func $ticks))
  (export "set_step" (func $set_step))
  (export "step" (func $step))
  (export "whole" (func $whole))
  (export "tenth" (func $tenth))
  (export "reset" (func $reset))
  (export "memory" (memory 0)))
