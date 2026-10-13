import type { ReactNode } from "react";
import Markdown, { type Components, defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";

// THE PALATE AS WRITTEN: in practice it is Markdown — the assistant writes it through
// `update_palate` with headings, lists and bold — so the page draws it rather than showing the
// symbols. Rendered on the server, with no client JavaScript.
//
// **The text is untrusted**: an assistant wrote it, from conversations and pages it read. So
// nothing in it reaches the page as markup. Raw HTML is shown as the text it is (react-markdown
// never passes it through, and no `rehype-raw` is added); a link keeps only a safe protocol
// (`defaultUrlTransform`: http, https, mailto…), and one left with none is drawn as its words;
// an image is drawn as its alt text, so the Palate never makes the browser fetch anything.
//
// The page title is "Palate", so a heading inside it is a section heading at most: `#` to
// `###` are drawn at section sizes, never bigger than the title, in the serif of the house; the
// text between them in the sans, where bold reads as bold (the serif's 700 is barely heavier).

const HEADING = "font-serif font-bold leading-snug text-glass";

const COMPONENTS: Components = {
  h1: ({ children }) => <h2 className={`${HEADING} text-2xl md:text-[26px]`}>{children}</h2>,
  h2: ({ children }) => <h3 className={`${HEADING} mt-2 text-xl md:text-[22px]`}>{children}</h3>,
  h3: ({ children }) => <h4 className={`${HEADING} text-lg`}>{children}</h4>,
  h4: ({ children }) => <h5 className={`${HEADING} text-base`}>{children}</h5>,
  h5: ({ children }) => <h6 className={`${HEADING} text-base`}>{children}</h6>,
  h6: ({ children }) => <p className={`${HEADING} text-base`}>{children}</p>,
  p: ({ children }) => <p>{children}</p>,
  ul: ({ children }) => (
    <ul className="list-disc space-y-1.5 pl-6 marker:text-glass-quiet">{children}</ul>
  ),
  ol: ({ children, start }) => (
    <ol start={start} className="list-decimal space-y-1.5 pl-6 marker:text-glass-quiet">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-1">{children}</li>,
  strong: ({ children }) => <strong className="font-bold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="flex flex-col gap-3 border-l-2 border-rule-field pl-4 text-glass-quiet">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-1 border-rule" />,
  a: ({ href, children }) => <Link href={href}>{children}</Link>,
  img: ({ alt }) => (alt ? <span>{alt}</span> : null),
  code: ({ children }) => (
    <code className="rounded bg-paper-quiet px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-xl bg-paper-quiet p-3 text-sm [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-base">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-rule-field py-1.5 pr-4 font-bold">{children}</th>
  ),
  td: ({ children }) => <td className="border-b border-rule py-1.5 pr-4 align-top">{children}</td>,
};

/** A link out of the Palate: always to another site, so a new tab that is told nothing. */
function Link({ href, children }: { href?: string; children?: ReactNode }) {
  if (!href) return <span>{children}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-wine underline decoration-1 underline-offset-4 hover:decoration-2"
    >
      {children}
    </a>
  );
}

/** The Palate's Markdown, drawn in the page's type at a reading measure. */
export function PalateAsWritten({ prose }: { prose: string }) {
  return (
    <div className="flex max-w-[65ch] flex-col gap-4 text-[17px] leading-relaxed">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={COMPONENTS}
        urlTransform={defaultUrlTransform}
      >
        {prose}
      </Markdown>
    </div>
  );
}
