/// <reference types="vite/client" />

declare module "virtual:deck" {
  import type { DeckManifest } from "@kadal/deck";
  const manifest: DeckManifest;
  export default manifest;
}
