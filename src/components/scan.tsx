"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// THE SCANNER: the camera as a second way of filling in one field, and **nothing else** —
// tsundoku's `scan.tsx`, taken over with the stack (ADR-0001) and narrowed from a book's barcode
// to a bottle's.
//
// **It is an enhancement over a field that already works.** `/add` is a plain form with a search
// field in it. Typed, pasted, or filled in by the phone's own text scan out of the keyboard, that
// form posts and searches with no JavaScript running at all. What this adds is the fastest way to
// get the digits under the bars into that field, on the one device where they are printed on the
// bottle the owner is holding.
//
// So the button **is not rendered until a script is running**: a camera is a script, and a button
// that did nothing on a shop's signal was never an option. What it has instead of an unscripted
// twin is a twin *field*: the thing it fills in is there either way.
//
// **There is no derivation in here**, which is why this file has no test (`vitest.config.ts`).
// The digits go into the field and the form is submitted; whether they are a barcode at all, and
// what it names, is read on the server (`searchCatalogue`) and comes back as an ordinary page.
//
// **Two decoders, one API, and the wasm one is fetched only where it is needed.**
// `BarcodeDetector` is native in Chrome and on Android, and not in Safari — on the desk or on the
// phone, which is precisely the browser this is for. Where the platform has it, nothing is
// downloaded; where it does not, the same interface arrives from `barcode-detector` (ZXing in
// WebAssembly) behind a dynamic `import()` on the first press. A megabyte on a shop's signal is
// paid once, on a deliberate press, by the browsers that cannot do it otherwise.
//
// The wasm is served from our own origin (`/decoder/zxing_reader.wasm`) rather than from the CDN
// the library defaults to: a third party on the path of a press in a shop is one more thing to
// resolve and to be blocked. `src/app/vendored.test.ts` keeps the file we serve and the library we
// depend on the same decoder.

/**
 * The barcodes printed on a bottle: EAN-13 almost everywhere, EAN-8 on a small one, UPC on an
 * American one. Narrow on purpose — a detector asked for everything reads the shop's QR code and
 * the loyalty card first.
 */
const A_BOTTLES_BARCODE = ["ean_13", "ean_8", "upc_a", "upc_e"] as const;

/** Where the vendored decoder is served from. `src/app/vendored.test.ts` pins the bytes. */
const THE_DECODER = "/decoder/zxing_reader.wasm";

/** Milliseconds between looks at the frame: a little over four a second. */
const BETWEEN_LOOKS = 240;

/** The half of `BarcodeDetector` this component uses, which is one method. */
type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

type Native = {
  new (options: { formats: readonly string[] }): Detector;
  getSupportedFormats: () => Promise<string[]>;
};

/** A detector, from the platform where it has one and from WebAssembly where it does not. */
async function aDetector(): Promise<Detector> {
  const native = (window as unknown as { BarcodeDetector?: Native }).BarcodeDetector;

  if (native) {
    try {
      const supported = await native.getSupportedFormats();
      if (A_BOTTLES_BARCODE.every((format) => supported.includes(format))) {
        return new native({ formats: A_BOTTLES_BARCODE });
      }
    } catch {
      // A platform that has the class and cannot be asked what it reads is treated as not
      // having it. The wasm below reads the same barcode either way.
    }
  }

  const { BarcodeDetector, setZXingModuleOverrides } = await import("barcode-detector/ponyfill");

  setZXingModuleOverrides({
    locateFile: (path: string, prefix: string) =>
      path.endsWith(".wasm") ? THE_DECODER : `${prefix}${path}`,
  });

  return new BarcodeDetector({ formats: [...A_BOTTLES_BARCODE] });
}

const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * A press that opens the camera, reads a bottle's barcode, and submits the form the field is in.
 *
 * `into` is the id of that field. The digits are written into it and the form is submitted with
 * `requestSubmit()`, so the owner's whole gesture is *press, aim* — the search that follows is the
 * one the typed field posts.
 */
export function ScanABarcode({ into, className }: { into: string; className?: string }) {
  const [scripted, setScripted] = useState(false);
  const [looking, setLooking] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const camera = useRef<MediaStream | null>(null);
  const screen = useRef<HTMLVideoElement | null>(null);

  // The button exists only where there is something to run it.
  useEffect(() => setScripted(true), []);

  const stop = useCallback(() => {
    for (const track of camera.current?.getTracks() ?? []) track.stop();
    camera.current = null;
    setLooking(false);
  }, []);

  // A camera left running is a camera running in the owner's pocket.
  useEffect(() => stop, [stop]);

  const open = async () => {
    setFailed(null);

    // In the press itself, not in an effect after it: on iOS the permission prompt belongs to a
    // gesture, and an effect is no longer inside one.
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("No camera here.");
      camera.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
    } catch {
      setFailed(
        "The camera could not be opened. Type the digits under the bars, or read them with the keyboard's own text scan."
      );
      return;
    }

    setLooking(true);
  };

  useEffect(() => {
    if (!looking) return;

    const video = screen.current;
    const stream = camera.current;
    if (!video || !stream) return;

    let watching = true;
    let waiting: ReturnType<typeof setTimeout> | undefined;

    const found = (code: string) => {
      watching = false;
      const field = document.getElementById(into);

      // Loud, because a viewfinder that has simply stopped looking is indistinguishable from a
      // bad angle: the camera read the barcode and had nowhere to write it.
      if (!(field instanceof HTMLInputElement)) {
        setFailed(`Nowhere to put it: there is no field ${into}. Type the barcode instead.`);
        stop();
        return;
      }

      field.value = code;
      stop();
      // The same submit the field's own Enter performs. A barcode buys the typing, never a
      // different act.
      field.form?.requestSubmit();
    };

    (async () => {
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // Autoplay refused with a live stream is unusual; the frames stay black and the owner
        // presses Stop.
      }

      let detector: Detector;
      try {
        detector = await aDetector();
      } catch {
        if (watching) {
          setFailed(
            "The barcode reader could not be loaded. Type the digits, or try again on a better signal."
          );
          stop();
        }
        return;
      }

      const look = async () => {
        if (!watching) return;
        try {
          const codes = await detector.detect(video);
          const code = codes.find((one) => one.rawValue.trim() !== "");
          if (code) return found(code.rawValue.trim());
        } catch {
          // One unreadable frame is the normal case: the owner is moving a phone over a bottle.
        }
        waiting = setTimeout(look, BETWEEN_LOOKS);
      };

      await look();
    })();

    return () => {
      watching = false;
      if (waiting) clearTimeout(waiting);
    };
  }, [looking, into, stop]);

  if (!scripted) return null;

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label="Scan a barcode"
        className={cn(
          "grid size-[50px] shrink-0 place-items-center rounded-xl border border-rule-field bg-paper-raised text-glass hover:bg-paper-quiet",
          FOCUS,
          className
        )}
      >
        <svg
          viewBox="0 0 24 24"
          className="size-[22px]"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M4 7V5h3M17 5h3v2M20 17v2h-3M7 19H4v-2M8 8v8M11 8v8M14 8v8M16.5 8v8" />
        </svg>
      </button>

      {failed ? (
        <p role="alert" className="order-last basis-full text-pretty text-sm text-refusal">
          {failed}
        </p>
      ) : null}

      {looking ? (
        // Over the drawer and the bar, in the page's own paper: while it is open the viewfinder
        // is the screen.
        <div className="fixed inset-0 z-[60] flex flex-col gap-4 bg-paper p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
          <p className="text-pretty text-[15px] text-glass-quiet">
            Point it at the barcode on the back label. The digits go into the search on their own.
          </p>

          <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl ring-1 ring-rule">
            {/* `playsInline` or iOS takes the video full screen and out of this panel. Muted,
                because Safari will not autoplay a stream with sound. */}
            <video ref={screen} muted playsInline className="h-full w-full object-cover" />
            {/* A line to aim along: the whole of the guidance a viewfinder needs. */}
            <div className="pointer-events-none absolute inset-x-6 top-1/2 h-px bg-glass/40" />
          </div>

          <button
            type="button"
            onClick={stop}
            className={cn(
              "inline-flex min-h-12 items-center justify-center rounded-xl border border-rule-field text-[15px] font-medium text-glass hover:bg-paper-quiet",
              FOCUS
            )}
          >
            Stop
          </button>
        </div>
      ) : null}
    </>
  );
}
