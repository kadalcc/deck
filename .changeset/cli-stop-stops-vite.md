---
"@kadal/deck": patch
---

Stopping `kadal-deck` now stops the Vite it started. A signal sent to the CLI alone (an editor's or
a task runner's stop button, a parent process's `kill`) used to end it at once and leave Vite
running in the background, holding its port: `dev` handed on SIGTERM and SIGHUP but not SIGINT, and
the preview server behind `export`, `contrast` and `screenshot` was stopped only on a normal exit.
Ctrl+C in a terminal, which reaches both, was never affected.
