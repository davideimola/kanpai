import type { MetadataRoute } from "next";

// THE WEB APP MANIFEST — what the phone reads when the owner adds kanpai to a home screen
// (spec §4: installable, manifest and icons outside the gate). A placeholder until the
// visual direction exists: the name, the drawn icon, and the light ground.
//
// Two things about it are constraints rather than choices, and both come from it being read
// by an operating system rather than by the document:
//
//   - **it takes one ground.** A manifest has no media query, so `theme_color` and
//     `background_color` are the light paper and nothing else; the `<meta>` in
//     `./layout.tsx` carries both, and on a phone that is the one the status bar follows.
//   - **it must be fetchable without a cookie.** Chrome fetches a manifest with credentials
//     omitted unless the link says otherwise, so behind the owner gate it would answer
//     `307 /signin` and the install would silently never be offered. `src/proxy.ts` excludes
//     it by name, and `src/proxy.matcher.test.ts` pins that. Nothing in it is the owner's
//     data: an application's name and its logo are already on the sign-in screen.
//
// `start_url` is `/`, which is behind the gate, and that is correct: opening the app from the
// home screen with no session lands on the sign-in screen.

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "kanpai",
    short_name: "kanpai",
    description:
      "A single-owner record of wine and spirits: what was drunk, what is in the house, what is worth trying.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f5f5",
    theme_color: "#f5f5f5",
    // The drawn file alone, for now. iOS wants a PNG for its home screen and Android a
    // maskable one; both arrive with the mark itself, when there is a mark to render.
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
