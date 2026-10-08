import { rendererConfig } from "../../tsdown.renderer.ts";

// Vue needs no build helper: a Vue component is an object the renderer can recognise.
export default rendererConfig({}, false);
