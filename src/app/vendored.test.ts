import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { ZXING_WASM_SHA256, ZXING_WASM_VERSION } from "barcode-detector/ponyfill";
import { describe, expect, it } from "vitest";

// A wall, beside `./gated.test.ts` and for the same reason — tsundoku's, taken over with the
// scanner. **The failure it catches is silent.**
//
// One file in this repository is a binary we did not write: the barcode decoder the scanner
// (`src/components/scan.tsx`) falls back to in Safari, which has no `BarcodeDetector` of its
// own. It is committed under `public/` rather than fetched from a CDN at runtime, because a
// shop's signal is the one `/add` is for.
//
// A copy can drift from the library that loads it. `barcode-detector` is pinned exactly in
// `package.json`, and the wasm has no version at all; bump the dependency and the ponyfill asks
// for the build it ships with, is handed the one we vendored, and fails — in Safari only, on a
// press, in a shop. So: **the bytes we serve are the bytes the library expects**, and this is
// the arithmetic that says so. Re-vendoring, when it fails, is copying
// `zxing-wasm/dist/reader/zxing_reader.wasm` (the one `barcode-detector` resolves) over
// `public/decoder/zxing_reader.wasm`.
//
// Text and bytes in, a verdict out: no DOM, no renderer, no database.

/** Where the scanner asks for it — `src/components/scan.tsx`'s `THE_DECODER`. */
const SERVED_AT = "/decoder/zxing_reader.wasm";

const VENDORED = fileURLToPath(new URL(`../../public${SERVED_AT}`, import.meta.url));

describe("the decoder we serve is the decoder we depend on", () => {
  it("is there at the address the scanner asks for", () => {
    expect(() => readFileSync(VENDORED)).not.toThrow();
    expect(
      readFileSync(fileURLToPath(new URL("../components/scan.tsx", import.meta.url)), "utf8")
    ).toContain(`"${SERVED_AT}"`);
  });

  it("is the byte-exact build the pinned library expects", () => {
    const digest = createHash("sha256").update(readFileSync(VENDORED)).digest("hex");
    expect(digest).toBe(ZXING_WASM_SHA256);
  });

  it("reports which version that is, so a failure above says what to re-vendor", () => {
    expect(ZXING_WASM_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
