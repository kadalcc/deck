# Third-party notices

Kadal Deck is AGPL-3.0-or-later (see [`LICENSE`](./LICENSE) and [`LICENSING.md`](./LICENSING.md)).
This file records third-party software and models that a feature of the engine **reaches for but
does not ship**, where their licences are worth knowing before you turn the feature on. The
ordinary npm dependencies of `@kadal/deck` carry their own licence files in `node_modules`.

## Narration (Kokoro text-to-speech)

The narrator (`narration` in the deck config, the R key, `kadal-deck narrate`) can speak notes with
the Kokoro-82M model. None of the pieces below is inside the `@kadal/deck` npm package:

- `kokoro-js` is an **optional peer dependency**. It is installed into a deck only when its author
  asks for it (`kadal-deck narrate --setup`, or `npm install kokoro-js`). Without it the narrator
  uses the browser's own `speechSynthesis` and pre-rendered clips, and none of this code is built.
- The **model weights are downloaded at run time** from the Hugging Face Hub
  (`onnx-community/Kokoro-82M-v1.0-ONNX`) — by the browser on the first press of play (kept in
  its Cache Storage), or by `kadal-deck narrate` on the machine that runs it. They are never
  redistributed by this project.

When a deck has `kokoro-js` installed, its **build output** contains a Web Worker bundle with
kokoro-js, transformers.js, onnxruntime-web (and its `.wasm`) and phonemizer.js, including
espeak-ng compiled to WebAssembly. Whoever publishes that build distributes those components and
should keep this notice with it.

| Component | Version checked | Licence | Source | Where it runs |
| --- | --- | --- | --- | --- |
| Kokoro-82M (model weights), by hexgrad | v1.0 | Apache-2.0 | https://huggingface.co/hexgrad/Kokoro-82M · ONNX export: https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX | downloaded at run time |
| kokoro-js | 1.2.1 | Apache-2.0 | https://github.com/hexgrad/kokoro (`kokoro.js/`) · https://www.npmjs.com/package/kokoro-js | browser worker, `kadal-deck narrate` |
| @huggingface/transformers (transformers.js) | 3.8.1 (via kokoro-js `^3.5.1`) | Apache-2.0 | https://github.com/huggingface/transformers.js | browser worker, `kadal-deck narrate` |
| onnxruntime-web | 1.22.0-dev (pinned by transformers.js 3.8.1) | MIT | https://github.com/microsoft/onnxruntime | browser worker (its `.wasm` lands in the deck's `dist/assets/`) |
| onnxruntime-node | 1.21.0 | MIT | https://github.com/microsoft/onnxruntime | `kadal-deck narrate` only |
| phonemizer (phonemizer.js), by Xenova | 1.2.1 | Apache-2.0 (the JavaScript wrapper) | https://github.com/xenova/phonemizer.js | browser worker, `kadal-deck narrate` |
| eSpeak NG (compiled into phonemizer.js) | as bundled by phonemizer 1.2.1 | **GPL-3.0-or-later** | https://github.com/espeak-ng/espeak-ng (licence: `COPYING`, README "License Information") | browser worker, `kadal-deck narrate` |
| sharp / libvips (pulled in by transformers.js on Node; not used by narration) | sharp 0.34, libvips 1.2 | Apache-2.0 / LGPL-3.0-or-later | https://github.com/lovell/sharp · https://github.com/libvips/libvips | installed with `kokoro-js` on Node; never bundled for the browser |

### eSpeak NG and the AGPL

phonemizer.js is published under Apache-2.0, but the eSpeak NG engine it compiles in is
**GPL-3.0-or-later**, so a build that contains phonemizer.js carries eSpeak NG's terms.

That is compatible with this engine's licence. The GNU AGPL v3 and the GNU GPL v3 each have a
section 13 written for exactly this pairing: GPLv3 §13 ("Use with the GNU Affero General Public
License") permits linking or combining GPLv3-covered work with AGPLv3-covered work into a single
combined work and conveying the result, and AGPLv3 §13 ("Remote Network Interaction; Use with the
GNU General Public License") says the same from the other side. Each part keeps its own licence:
eSpeak NG stays GPL-3.0-or-later, the engine stays AGPL-3.0-or-later.

What that means for you:

- **Self-hosting an AGPL deck with Kokoro:** nothing beyond what the AGPL already asks; keep this
  notice and the eSpeak NG source link with the published build.
- **Under a commercial licence of Kadal Deck:** the commercial licence covers Kadal Deck only; it
  cannot relicense eSpeak NG. If you ship a build that includes the Kokoro worker, that worker's
  eSpeak NG part remains under the GPL (corresponding source:
  https://github.com/espeak-ng/espeak-ng and https://github.com/xenova/phonemizer.js). Use baked
  clips or the browser's voice instead if that does not suit you — a deck without `kokoro-js`
  installed contains none of it.
- **Baked audio** (`kadal-deck narrate` output: MP3/Opus/WAV files) is the output of the model,
  not a copy of eSpeak NG; the Kokoro weights' Apache-2.0 licence places no restriction on it.
