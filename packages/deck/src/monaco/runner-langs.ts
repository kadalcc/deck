/**
 * The languages `{monaco-run}` has a runner for out of the box, and the aliases a runner is
 * registered and looked up under. Shared by the runner registry (runners.ts) and `kadal-deck
 * check` (authoring/lint.ts), so the two agree on what runs.
 */
const ALIASES: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  py: "python",
  python3: "python",
};

/** `ts` → `typescript`, `PY` → `python`; any other language, lowercased. */
export const runnerLang = (lang: string): string => {
  const l = lang.toLowerCase();
  return ALIASES[l] ?? l;
};

export const BUILTIN_RUNNER_LANGS: readonly string[] = ["javascript", "typescript", "python"];
