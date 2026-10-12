# Sources are Open Food Facts, then Vivino, and images are hotlinked

Status: **superseded by [ADR-0011](0011-sources-are-asked-by-kind-propose-candidates-and-vivino-is-opt-in.md)** —
the measurement found the order backwards for wine, Vivino's terms forbidding automated access
outright, and the endpoint worth using to be Algolia's rather than vivino.com's
([`docs/research/sources.md`](../research/sources.md)).

Finding a Label and its bottle image goes through **one Source adapter** with two backends, in
order: **Open Food Facts** (open data, an official API, searchable by barcode and by name) and
then **Vivino** (best coverage of Italian wine and the best bottle shots, through the undocumented
endpoints its own website uses). The image is **hotlinked**, as tsundoku hotlinks covers
(tsundoku ADR-0013): we store the Source, its id, the image URL and its page, never the bytes.
The one image this app hosts is a photograph the **owner** uploads, which overrides the Source's.

Open Food Facts alone is the clean answer and covers supermarket wine and spirits well, but small
Italian producers are thin there; Vivino is the reverse. The owner accepted the Vivino fallback
knowing it is unofficial.

## Consequences

- **Vivino can break without notice**, and its terms do not invite this use. The adapter treats
  a Vivino failure as *no answer*, never as *no such wine*; the app keeps working without images.
  Requests are made only on an explicit search — never on a page render — so the volume stays
  at one human's searches.
- The image element is a plain `<img>`, never `next/image`, so no third-party byte is cached on
  our server.
- Changing or adding a Source is a change to one module.
- **Open question:** the exact Vivino endpoints and whether their image URLs are stable enough
  to store. To be measured before S3 is built, as tsundoku measured covers.
