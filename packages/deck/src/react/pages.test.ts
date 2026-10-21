import { describe, expect, test } from "bun:test";

import { pageFor } from "./Deck.tsx";

const Presenter = () => null;
const Remote = () => null;
const Stats = () => null;

describe("pageFor", () => {
  test("a deck's own page wins", () => {
    expect(pageFor("remote", { presenter: Presenter, remote: Remote })).toBe(Remote);
    expect(pageFor("stats", { stats: Stats })).toBe(Stats);
  });

  test("a deck with a presenter and no remote page still serves the phone remote", () => {
    const page = pageFor("remote", { presenter: Presenter, stats: Stats });
    expect(page).not.toBeNull();
    expect(page).not.toBe(Presenter);
  });

  test("without a presenter there is no QR code to scan, so no remote is made up", () => {
    expect(pageFor("remote", {})).toBeNull();
    expect(pageFor("remote", { stats: Stats })).toBeNull();
  });

  test("other missing pages stay missing, and play and print are no page", () => {
    expect(pageFor("stats", { presenter: Presenter })).toBeNull();
    expect(pageFor("play", { presenter: Presenter, remote: Remote })).toBeNull();
    expect(pageFor("print", { presenter: Presenter })).toBeNull();
  });
});
