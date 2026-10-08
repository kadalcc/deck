#!/usr/bin/env bun
/** `bun run export` inside a deck in this repository; `kadal-deck export` everywhere else. */
import { runExport } from "./run.ts";

await runExport(process.argv.slice(2), process.cwd());
