declare module "virtual:deck" {
  import type { DeckManifest } from "@kadal/deck";
  const manifest: DeckManifest;
  export default manifest;
  export const slides: DeckManifest["slides"];
  export const headmatter: DeckManifest["headmatter"];
}
