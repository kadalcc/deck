/**
 * `@kadal/deck/sync`: merging two edits of a deck — the CLI's files and the web builder's — and
 * the source manifest both sides agree on. Pure: no DOM, no Node APIs (Web Crypto for hashes),
 * so the same code runs in the CLI, the engine's MCP server, a browser editor and a Worker.
 *
 *   mergeDeckSource(base, ours, theirs)   every editable file, by kind (deck files slide by slide)
 *   mergeMdx(base, ours, theirs)          one deck file, slide-aware
 *   hasConflictMarkers / findConflicts    what is left to resolve
 *   resolveConflict / resolveSlide        settle it: ours, theirs, or both
 *   sourceHash / sourceManifest           one hash for a source tree; EDITABLE_GLOBS / isEditablePath
 */
export {
  type Conflict,
  type MergeOptions,
  type SourceFiles,
  findConflicts,
  mergeMdx,
  slideAtLine,
} from "./mdx.ts";
export {
  DELETED_FILE_SUFFIX,
  type MergeResult,
  mergeDeckSource,
  resolveConflict,
  resolveSlide,
} from "./merge.ts";
export {
  DELETED_SUFFIX,
  type MarkerBlock,
  hasConflictMarkers,
  markerBlocks,
  strayMarkers,
} from "./markers.ts";
export {
  EDITABLE_GLOBS,
  SOURCE_LIMITS,
  canonicalManifest,
  globToRegExp,
  ignoreMatcher,
  isEditablePath,
  sha256Hex,
  sourceHash,
  sourceManifest,
} from "./manifest.ts";
export { type Hunk, type MergeChunk, diff3, diffHunks } from "./diff.ts";
