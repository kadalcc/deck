#!/usr/bin/env node
import { main } from "./index.ts";

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e instanceof Error ? `error: ${e.message}` : e);
    process.exit(1);
  },
);
