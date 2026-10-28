---
"@kadal/deck": patch
---

`kadal-deck import slidev` and `import reveal` no longer say "100% with nothing to report" and then list a problem:

- **The summary counts everything.** A slide is clean only when neither the converter nor the check that follows found a warning or error on it, and problems that belong to no slide (classes with no CSS, a `setup/` file left behind) are counted as "N problems for the whole deck" on the same line. `IMPORT-REPORT.md` says the same. A deck with one slide in 200 flagged shows 99%, not a rounded-up 100%. In `--json`, `cleanSlides` follows the same rule and `wholeDeck` gives the count.
- **A missing image is an error, not "a package to install".** Before `npm install`, only missing themes, addons and icon sets were meant to wait for the install; every `*-missing` code did, so an image or snippet that was not there went unreported and the import exited 0.
