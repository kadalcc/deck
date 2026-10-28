---
"@kadal/deck": minor
---

Steps behave more like reveal.js's fragments:

- **`fragments: false`** works. It was read and then ignored. Now every slide is drawn at its last
  step, and a press goes straight to the next slide.
- **reveal's class names.** A step also wears `fragment`, `visible` (with `is-shown`) and
  `current-fragment` (with `is-current`), so CSS written for reveal.js, such as
  `.fragment.blur.visible`, works unchanged.
- **Custom effects.** `effect` takes any name and adds the class `effect-<name>` on top of the
  default fade. `effect="custom"`, or a `custom` class as reveal.js writes it, has no default fade,
  so your CSS alone decides how the step looks.
- **`<Click autoSlide={ms}>`** writes `data-autoslide` on the step, for auto-slide to wait that
  long on it (reveal.js's `data-autoslide` on a fragment).
