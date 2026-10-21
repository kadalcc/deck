import type { ShikiTransformer } from "shiki";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * TWOSLASH, at build time
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ```ts twoslash runs the block through the TypeScript compiler while the deck builds, and the
 * slide arrives with the answers already in it: every identifier carries its type in a popup,
 * errors are underlined with the compiler's message beneath the line, `// ^?` pins a type open
 * under the token above it. Nothing of TypeScript reaches the audience — it is HTML and CSS.
 *
 * TypeScript itself is an optional peer: a deck that never writes `twoslash` does not need it,
 * and one that does without it installed gets one warning and plain highlighted blocks. The
 * runtime compiler (the hosted shell) never loads this module: it has no compiler to hand, so it
 * renders the same blocks plain and says so once in the console (see runtime/compile.ts).
 *
 * Errors are rendered rather than thrown (`noErrorValidation`): a slide about a type error should
 * show the error, not fail the build. Imports resolve from the deck's folder, so a slide can show
 * the real types of the packages the deck has installed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const TWOSLASH_LANGS = ["ts", "tsx", "js", "jsx", "typescript", "javascript", "mts", "cts"];

export async function loadTwoslash(
  root: string,
  warn: (message: string) => void,
): Promise<ShikiTransformer | null> {
  try {
    await import("typescript");
  } catch {
    warn(
      "twoslash: TypeScript is not installed, so `twoslash` blocks render without types. Add it with `bun add -d typescript` (or npm/pnpm).",
    );
    return null;
  }
  try {
    const { transformerTwoslash, rendererRich } = await import("@shikijs/twoslash");
    return transformerTwoslash({
      // The pipeline adds this transformer to `twoslash` blocks only; inside, every one runs.
      explicitTrigger: false,
      langs: TWOSLASH_LANGS,
      throws: false,
      onTwoslashError: (error) => {
        const message = error instanceof Error ? error.message : String(error);
        warn(`twoslash: ${message.split("\n").slice(0, 3).join(" ")} — the block renders plain`);
      },
      renderer: rendererRich({
        // A token with a popup is reachable from the keyboard: Tab to it, the popup opens
        // (code.css shows it on :focus-within as well as :hover).
        hast: {
          hoverToken: { properties: { tabindex: "0" } },
          hoverPopup: { properties: { role: "tooltip" } },
        },
      }),
      twoslashOptions: {
        vfsRoot: root,
        handbookOptions: { noErrorValidation: true },
      },
    });
  } catch (err) {
    warn(`twoslash: could not start (${err instanceof Error ? err.message : String(err)})`);
    return null;
  }
}
