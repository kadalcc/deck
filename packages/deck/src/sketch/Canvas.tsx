import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

import { useUi } from "../react/hooks.ts";
import { getScene } from "./render.ts";

/**
 * The real Excalidraw canvas, in view mode, for the lightbox: pan, zoom and point at a part of a
 * sketch during the talk. Loaded only when a sketch is opened — the package is 2.7 MB.
 */
export default function SketchCanvas({ id }: { id: string }) {
  const scene = getScene(id);
  const scheme = useUi((s) => s.colorScheme);
  if (!scene) return <div className="deck-sketch-missing">This sketch has not been drawn yet.</div>;
  return (
    <div className="deck-sketch-canvas">
      <Excalidraw
        initialData={{
          elements: scene.elements as never,
          files: scene.files as never,
          appState: { viewBackgroundColor: "#fbfbf9" },
          scrollToContent: true,
        }}
        viewModeEnabled
        zenModeEnabled
        theme={scheme}
        detectScroll={false}
        handleKeyboardGlobally={false}
        autoFocus
        UIOptions={{
          canvasActions: {
            changeViewBackgroundColor: false,
            clearCanvas: false,
            export: false,
            loadScene: false,
            saveAsImage: false,
            saveToActiveFile: false,
            toggleTheme: false,
          },
          tools: { image: false },
        }}
      />
    </div>
  );
}
