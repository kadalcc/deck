---
"@kadal/deck": patch
---

`kadal-deck check` knows the deck's own code runners. A `{monaco-run}` block in a language registered in `setup/code-runners.ts` or with `registerCodeRunner(...)` is no longer reported as having no runner; the check and the runner registry now share one list of built-in languages and aliases.
