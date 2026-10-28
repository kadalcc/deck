---
"@kadal/deck": patch
---

`kadal-deck build --help` and `kadal-deck dev --help` print Kadal Deck's own help for the command, not Vite's. Every other command's `--help` (and `kadal-deck help <command>`) now prints that command's part of the help rather than all of it.

A flag that neither Kadal Deck nor Vite knows (`dev --bogus`), a Vite flag with its value missing (`build --outDir`), or a number that isn't one (`dev --port abc`) is now a one-line usage error (exit 2) that names the command's `--help`, before Vite starts. It used to print Vite's `CACError` stack trace. Vite's own flags (`--port`, `--strictPort`, `--open`, `--outDir`, `--sourcemap`, `--mode`, `-c`… in camel or kebab case) still go to Vite as written.
