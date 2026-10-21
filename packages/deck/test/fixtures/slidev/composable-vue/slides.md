---
layout: cover
download: 'https://antfu.me/talks/2021-04-29'
highlighter: shiki
monaco: true
info: |
  ## Composable Vue

  Patterns and tips for writing good composable logic in Vue

  [Anthony Fu](https://antfu.me/) at [VueDay 2021](https://2021.vueday.it/)

  - [Recording](https://www.youtube.com/watch?v=IMJjP6edHd0)
  - [Transcript](https://antfu.me/posts/composable-vue-vueday-2021)
  - [Source code](https://github.com/antfu/talks/tree/master/2021-04-29)
---

# Composable Vue

Patterns and tips for writing good composable logic in Vue

<div class="uppercase text-sm tracking-widest">
Anthony Fu
</div>

<div class="abs-bl mx-14 my-12 flex">
  <img src="https://2020.vueday.it/img/themes/vueday/vueday-logo.png" class="h-8" alt="">
  <div class="ml-3 flex flex-col text-left">
    <div><b>Vue</b>Day</div>
    <div class="text-sm opacity-50">Apr. 29th, 2021</div>
  </div>
</div>

---
layout: 'intro'
---

# Anthony Fu

<div class="leading-8 opacity-80">
Vue core team member and Vite team member.<br>
Creator of VueUse, i18n Ally and Type Challenges.<br>
A fanatical full-time open sourceror.<br>
</div>

<div class="my-10 grid grid-cols-[40px_1fr] w-min gap-y-4">
  <ri-github-line class="opacity-50"/>
  <div><a href="https://github.com/antfu" target="_blank">antfu</a></div>
  <ri-twitter-line class="opacity-50"/>
  <div><a href="https://twitter.com/antfu7" target="_blank">antfu7</a></div>
  <ri-user-3-line class="opacity-50"/>
  <div><a href="https://antfu.me" target="_blank">antfu.me</a></div>
</div>

<img src="https://antfu.me/avatar.png" class="rounded-full w-40 abs-tr mt-16 mr-12" alt="A comic art image of Anthony Fu"/>

---
name: Sponsors
layout: center
---

<img class="h-100 -mt-10" src="https://cdn.jsdelivr.net/gh/antfu/static/sponsors.png" alt="A list of the sponsor logos" /><br>
<div class="text-center text-xs opacity-50 -mt-8 hover:opacity-100">
  <a href="https://github.com/sponsors/antfu" target="_blank">
    Sponsor me at GitHub
  </a>
</div>

---
layout: center
---

# Composable Vue

---
name: VueUse
layout: center
---

<div class="grid grid-cols-[3fr_2fr] gap-4">
  <div class="text-center pb-4">
    <img class="h-50 inline-block" src="https://vueuse.org/favicon.svg" alt="">
    <div class="opacity-50 mb-2 text-sm">
      Collection of essential Vue Composition Utilities
    </div>
    <div class="text-center">
      <a class="!border-none" href="https://www.npmjs.com/package/@vueuse/core" target="__blank"><img class="h-4 inline mx-0.5" src="https://img.shields.io/npm/v/@vueuse/core?color=a1b858&label=" alt="NPM version"></a>
      <a class="!border-none" href="https://www.npmjs.com/package/@vueuse/core" target="__blank"><img class="h-4 inline mx-0.5" alt="NPM Downloads" src="https://img.shields.io/npm/dm/@vueuse/core?color=50a36f&label="></a>
      <a class="!border-none" href="https://vueuse.org" target="__blank"><img class="h-4 inline mx-0.5" src="https://img.shields.io/static/v1?label=&message=docs%20%26%20demos&color=1e8a7a" alt="Docs & Demos"></a>
      <img class="h-4 inline mx-0.5" alt="Function Count" src="https://img.shields.io/badge/-114%20functions-13708a">
      <br>
      <a class="!border-none" href="https://github.com/vueuse/vueuse" target="__blank"><img class="mt-2 h-4 inline mx-0.5" alt="GitHub stars" src="https://img.shields.io/github/stars/vueuse/vueuse?style=social"></a>
    </div>
  </div>
  <div class="border-l border-main !all:leading-12 !all:list-none my-auto">

  - Works for both Vue 2 and 3
  - Tree-shakeable ESM
  - CDN compatible
  - TypeScript
  - Rich ecosystems

  </div>
</div>

---
layout: center
class: text-center
---

# Composition API

a brief go-through

---

<div class="grid grid-cols-2 gap-x-4"><div>

# Ref

```ts {monaco}
import { ref } from 'vue'

let foo = 0
let bar = ref(0)

foo = 1
bar = 1 // ts-error
```

<div v-click>

### Pros

- More explicit, with type checking
- Less caveats

### Cons

- `.value`

</div>

</div><div>

# Reactive

```ts {monaco}
import { reactive } from 'vue'

const foo = { prop: 0 }
const bar = reactive({ prop: 0 })

foo.prop = 1
bar.prop = 1
```

<div v-click>

### Pros

- Auto unwrapping (a.k.a `.value` free)

### Cons

- Same as plain objects on types
- Destructure loses reactivity
- Need to use callback for `watch`

</div>
</div></div>

---

# Ref Auto Unwrapping <MarkerCore />

Get rid of `.value` for most of the time.

<div class="grid grid-cols-2 gap-x-4">

<v-clicks :every='2'>

- `watch` accepts ref as the watch target, and returns the unwrapped value in the callback

```ts
const counter = ref(0)

watch(counter, (count) => {
  console.log(count) // same as `counter.value`
})
```

- Ref is auto unwrapped in the template

```html
<template>
  <button @click="counter += 1">
    Counter is {{ counter }}
  </button>
</template>
```

- Reactive will auto-unwrap nested refs.

<div>

```ts {monaco}
import { reactive, ref } from 'vue'

const foo = ref('bar')
const data = reactive({ foo, id: 10 })
data.foo // 'bar'
```

</div>

</v-clicks>

</div>

---

# `unref` - Opposite of Ref <MarkerCore />

- If it gets a Ref, returns the value of it.
- Otherwise, returns as-is.

<div class="grid grid-cols-2 gap-x-4 mt-4">

<div v-click>

### Implementation

```ts
function unref<T>(r: Ref<T> | T): T {
  return isRef(r) ? r.value : r
}
```

</div><div v-click>

### Usage

```ts {monaco}
import { ref, unref } from 'vue'

const foo = ref('foo')
unref(foo) // 'foo'

const bar = 'bar'
unref(bar) // 'bar'
```

</div></div>

---
layout: center
class: text-center
---

# Patterns & Tips

of writing composable functions

---

# What's Composable Functions

Sets of reusable logic, separation of concerns.

<div v-click class="grid grid-cols-[1fr_130px]">

```ts
export function useDark(options: UseDarkOptions = {}) {
  const preferredDark = usePreferredDark() // <--
  const store = useLocalStorage('vueuse-dark', 'auto') // <--

  return computed<boolean>({
    get() {
      return store.value === 'auto'
        ? preferredDark.value
        : store.value === 'dark'
    },
    set(v) {
      store.value = v === preferredDark.value
        ? 'auto'
        : v ? 'dark' : 'light'
    },
  })
}
```

<div class="grid">
<DarkToggle class="m-auto"/>
</div>

</div>

<div v-click class="abs-b mx-14 my-12">
<VueUse name="useDark"/>
</div>

---

# Think as "Connections"

The `setup()` only runs **once** on component initialization, to construct the relations between your state and logic.

- Input → Output<sup class="ml-1 opacity-50">Effects</sup>
- Output reflects to input's changes automatically

<div class="grid grid-cols-[auto_1fr] gap-4">
  <Connections v-click class="mt-4"/>
  <div v-click class="p-4">
    <h3 class="pb-2">SpreadSheet Formula</h3>
    <img class="h-40" src="https://cdn.wallstreetmojo.com/wp-content/uploads/2019/01/Division-Formula-in-Excel-Example-1-1.png" alt="">
  </div>
</div>

---

# One Thing at a Time

Just the same as authoring JavaScript functions.

- Extract duplicated logics into composable functions
- Have meaningful names
- Consistent naming conversions - `useXX` `createXX` `onXX`
- Keep function small and simple
- "Do one thing, and do it well"

---

# Passing Refs as Arguments <MarkerPattern />

<div class="grid grid-cols-[160px_1fr_180px] gap-x-4">

<div />

### Implementation

### Usage

<v-clicks :every='3'>

<div class="my-auto leading-6 text-base opacity-75">
Plain function
</div>

```ts
function add(a: number, b: number) {
  return a + b
}
```

```ts
const a = 1
const b = 2

const c = add(a, b) // 3
```

<div class="my-auto leading-6 text-base opacity-75">
Accepts refs,<br>
returns a reactive result.
</div>

```ts
function add(a: Ref<number>, b: Ref<number>) {
  return computed(() => a.value + b.value)
}
```

```ts
const a = ref(1)
const b = ref(2)

const c = add(a, b)
c.value // 3
```

<div class="my-auto leading-6 text-base opacity-75">
Accepts both refs and plain values.
</div>

```ts
function add(
  a: Ref<number> | number,
  b: Ref<number> | number,
) {
  return computed(() => unref(a) + unref(b))
}
```

```ts
const a = ref(1)

const c = add(a, 5)
c.value // 6
```

</v-clicks>

</div>

---

# MaybeRef <MarkerTips/>

A custom type helper

```ts
type MaybeRef<T> = Ref<T> | T
```

<v-click>

In VueUse, we use this helper heavily to support optional reactive arguments

```ts
export function useTimeAgo(
  time: Date | number | string | Ref<Date | number | string>,
) {
  return computed(() => someFormating(unref(time)))
}
```

```ts {monaco}
import type { Ref } from 'vue'
import { computed, unref } from 'vue'

type MaybeRef<T> = Ref<T> | T

export function useTimeAgo(
  time: MaybeRef<Date | number | string>,
) {
  return computed(() => someFormating(unref(time)))
}
```

</v-click>

---

# Make it Flexible <MarkerPattern />

Make your functions like LEGO, can be used with different components in different ways.

<div class="grid grid-cols-2 gap-x-4">

<div v-click>

### Create a "Special" Ref

```ts {monaco}
import { useTitle } from '@vueuse/core'

const title = useTitle()

title.value = 'Hello World'
// now the page's title changed
```

</div><div v-click>

### Binding an Existing Ref

```ts {monaco}
import { useTitle } from '@vueuse/core'
import { computed, ref } from 'vue'

const name = ref('Hello')
const title = computed(() => {
  return `${name.value} - World`
})

useTitle(title) // Hello - World

name.value = 'Hi' // Hi - World
```

</div></div>

<div v-click class="abs-b mx-14 my-12">
<VueUse name="useTitle"/>
</div>

