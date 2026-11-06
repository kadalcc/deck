import { describe, expect, test } from "bun:test";

import { LutError, identityCube, lutStrengthOf, parseCube, sampleCube } from "./lut.ts";

describe(".cube LUTs", () => {
  test("an identity cube reads back as itself, red fastest", () => {
    const lut = parseCube(identityCube(3));
    expect(lut.title).toBe("Identity");
    expect(lut.size).toBe(3);
    expect(lut.data.length).toBe(27 * 3);
    // Entry 1 is (r=0.5, g=0, b=0); entry 3 is (0, 0.5, 0); entry 9 is (0, 0, 0.5).
    expect(Array.from(lut.data.slice(3, 6))).toEqual([0.5, 0, 0]);
    expect(Array.from(lut.data.slice(9, 12))).toEqual([0, 0.5, 0]);
    expect(Array.from(lut.data.slice(27, 30))).toEqual([0, 0, 0.5]);
    for (const c of [
      [0, 0, 0],
      [1, 1, 1],
      [0.2, 0.7, 0.4],
      [0.93, 0.05, 0.5],
    ] as Array<[number, number, number]>)
      sampleCube(lut, c).forEach((v, k) => expect(v).toBeCloseTo(c[k]!, 5));
  });

  test("comments, CRLF, blank lines, a vendor's keywords and Resolve's input range", () => {
    const text = [
      "# made by hand",
      'TITLE "Warm"',
      "LUT_3D_SIZE 2",
      "LUT_3D_INPUT_RANGE 0 2",
      "VENDOR_THING 7",
      "",
      "0 0 0",
      "1 0 0 # red",
      "0 1 0",
      "1 1 0",
      "0 0 1",
      "1 0 1",
      "0 1 1",
      "1 1 1",
    ].join("\r\n");
    const lut = parseCube(text);
    expect(lut.domainMin).toEqual([0, 0, 0]);
    expect(lut.domainMax).toEqual([2, 2, 2]);
    // An input of 1 is the middle of a 0–2 domain.
    sampleCube(lut, [1, 1, 1]).forEach((v) => expect(v).toBeCloseTo(0.5, 5));
  });

  test("a grade: every colour to the colour its cube gives", () => {
    // Everything maps to a warm grey: red up, blue down.
    const lines = ["LUT_3D_SIZE 2"];
    for (let i = 0; i < 8; i++) lines.push("0.8 0.5 0.2");
    const lut = parseCube(lines.join("\n"));
    const [r, g, b] = sampleCube(lut, [0.3, 0.6, 0.9]);
    expect(r).toBeCloseTo(0.8, 5);
    expect(g).toBeCloseTo(0.5, 5);
    expect(b).toBeCloseTo(0.2, 5);
  });

  test("a 1D LUT is sampled into a 33³ cube, one curve per channel", () => {
    const lut = parseCube(["LUT_1D_SIZE 2", "0 0 0", "1 0.5 0.25"].join("\n"));
    expect(lut.size).toBe(33);
    const out = sampleCube(lut, [1, 1, 1]);
    expect(out[0]).toBeCloseTo(1, 5);
    expect(out[1]).toBeCloseTo(0.5, 5);
    expect(out[2]).toBeCloseTo(0.25, 5);
    expect(sampleCube(lut, [0.5, 0.5, 0.5])[1]).toBeCloseTo(0.25, 5);
  });

  test("what it can't use, it says", () => {
    expect(() => parseCube("hello")).toThrow(LutError);
    expect(() => parseCube("LUT_3D_SIZE 2\n0 0 0")).toThrow(/expected 8 entries/);
    expect(() => parseCube("LUT_3D_SIZE 1")).toThrow(/between 2/);
    expect(() => parseCube("LUT_3D_SIZE 2\n0 0")).toThrow(/three numbers/);
    expect(() => parseCube(`DOMAIN_MIN 1 1 1\nDOMAIN_MAX 0 0 0\n${identityCube(2)}`)).toThrow(
      /DOMAIN_MAX/,
    );
  });

  test("lutStrength is a 0–1 mix, 1 by default", () => {
    expect(lutStrengthOf(undefined)).toBe(1);
    expect(lutStrengthOf(0.4)).toBe(0.4);
    expect(lutStrengthOf("0.25")).toBe(0.25);
    expect(lutStrengthOf(3)).toBe(1);
    expect(lutStrengthOf(-1)).toBe(0);
    expect(lutStrengthOf("x")).toBe(1);
  });
});
