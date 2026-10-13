import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PalateAsWritten } from "./as-written";

// A wall, like `../../vendored.test.ts`, and not a rendering test of the page: **the Palate is
// text an assistant wrote**, and what it may put on the page is a security property that fails
// silently — a script that runs, a link that runs one. Text in, markup out; no DOM, no
// database.

const drawn = (prose: string) => renderToStaticMarkup(createElement(PalateAsWritten, { prose }));

describe("the Palate as written", () => {
  it("draws headings, lists, bold and italic", () => {
    const html = drawn(
      "# Il mio Palate\n\n## Cosa mi piace\n\n- **Rossi morbidi**, *frutta scura*\n- Gin secchi\n\n1. uno\n2. due"
    );
    expect(html).toMatch(/<h2[^>]*>Il mio Palate<\/h2>/);
    expect(html).toMatch(/<h3[^>]*>Cosa mi piace<\/h3>/);
    expect(html).toMatch(/<ul[^>]*>\s*<li[^>]*><strong[^>]*>Rossi morbidi<\/strong>, <em[^>]*>/);
    expect(html).toMatch(/<ol[^>]*>/);
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("**");
    expect(html).not.toContain("# ");
  });

  it("never draws a heading bigger than the page's own title", () => {
    expect(drawn("# A")).not.toMatch(/<h1/);
  });

  it("shows raw HTML as text instead of passing it through", () => {
    const html = drawn(
      'Before\n\n<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\ninline <b onclick="x()">b</b>'
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b ");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
  });

  it("drops a javascript: link, keeping its words", () => {
    for (const href of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "vbscript:x",
      "data:text/html,x",
    ]) {
      const html = drawn(`[click me](${href})`);
      expect(html).not.toMatch(/<a /);
      expect(html.toLowerCase()).not.toContain("script:");
      expect(html).not.toContain("data:");
      expect(html).toContain("click me");
    }
  });

  it("opens a real link in a new tab that is told nothing", () => {
    const html = drawn("[a shop](https://example.com/wine)");
    expect(html).toContain('href="https://example.com/wine"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("draws an image as its alt text, so the Palate fetches nothing", () => {
    const html = drawn("![a label](https://tracker.example/pixel.png)");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("tracker.example");
    expect(html).toContain("a label");
  });
});
