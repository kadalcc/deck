/**
 * `@kadal/deck/sketch` — draw Excalidraw diagrams in code. Plain data: nothing here loads the
 * Excalidraw package; `<Sketch scene={…}>` on a slide does, when the sketch renders.
 */
export {
  sketch,
  type ArrowInput,
  type NodeInput,
  type RegionInput,
  type SketchFill,
  type SketchFont,
  type SketchRegionMeta,
  type SketchScene,
  type SketchShape,
  type TextInput,
} from "./dsl.ts";
export { PALETTE, type SketchTone } from "./palette.ts";
export type { ExcalidrawFile, SketchInput } from "./render.ts";
