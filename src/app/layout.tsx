import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "kanpai",
  description:
    "A single-owner record of wine and spirits: what was drunk, what is in the house, what is worth trying.",
  // Added to a home screen, it opens as itself, with no browser chrome over it. The
  // manifest says the same to Android in `./manifest.ts`; this is the half iOS reads.
  appleWebApp: { capable: true, title: "kanpai", statusBarStyle: "default" },
};

// Used phone-in-hand at a table and at a desk, so mobile-first and the width of the
// device. User zoom stays on.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The phone's own chrome, told which ground it is on. These two are the only colours
  // named outside `globals.css`, because a status bar is outside the cascade and cannot be
  // handed a `var()`: they are `--paper`, light and dark, in sRGB.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f0f" },
  ],
};

// shadcn ships its dark tokens hung off a `.dark` class, so following the operating system
// is one line that sets it. It runs before first paint, which is what keeps a white flash
// out of a dark room.
const theme =
  "try{document.documentElement.classList.toggle('dark',matchMedia('(prefers-color-scheme: dark)').matches)}catch(e){}";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: the no-flash theme setter */}
        <script dangerouslySetInnerHTML={{ __html: theme }} />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
