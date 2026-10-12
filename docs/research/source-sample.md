# The source sample

The Labels the owner had recorded in Vivino on 2026-10-12, transcribed from the web profile.
They are the fixed input for the S3 measurement
([ADR-0006](../adr/0006-sources-are-open-food-facts-then-vivino-and-images-are-hotlinked.md)):
how many of them Open Food Facts and Vivino each resolve, and with what image. No ratings or
dates are kept here; only what identifies the Label.

Vivino shows "—" for the vintage where the owner did not record one.

| # | producer | label | vintage | appellation / region | Kind |
|---|---|---|---|---|---|
| 1 | Principe Corsini | Cortevecchia Riserva Chianti Classico | 2022 | Chianti Classico | red |
| 2 | Principe Corsini | Don Tommaso Gran Selezione Chianti Classico | 2022 | Chianti Classico | red |
| 3 | Tenuta San Guido | Sassicaia | 2005 | Bolgheri Sassicaia | red |
| 4 | Masi | Brolo Campofiorin | 2021 | Rosso Veronese | red |
| 5 | Masi | Costasera Amarone della Valpolicella Classico | 2004 | Amarone della Valpolicella Classico | red |
| 6 | Martino Biscardo – L'Ornato | Parziale Appassimento Rosso | 2022 | Veneto | red |
| 7 | Rocca Sveva | Valpolicella Superiore | 2018 | Valpolicella | red |
| 8 | Farina | Valpolicella Classico Superiore | — | Valpolicella Classico | red |
| 9 | Montelliana | Asolo Prosecco Superiore Extra Dry | 2017 | Prosecco | sparkling |
| 10 | Fattoria le Corti | Le Corti Chianti Classico | 2024 | Chianti Classico | red |
| 11 | Principe Corsini | Sparkling Rosé | — | Toscana | sparkling |
| 12 | Montelliana | Mont Blanc Cuvée Extra Dry | — | Prosecco di Treviso | sparkling |
| 13 | Guido Berlucchi | Franciacorta Cuvée Imperiale Brut | NV | Franciacorta | sparkling |
| 14 | Biscardo | Enigma Apassimento Sangiovese Rubicone | — | Rubicone | red |

## Already visible

- **Producers are often written two ways** (*Fattoria le Corti* and *Principe Corsini* are the
  same estate; *Biscardo* and *Martino Biscardo – L'Ornato* likely too). Label search must not
  rely on the producer string matching exactly.
- **Four of fourteen have no vintage** although they are not NV wines: the owner did not record
  it. They go to an **unknown** Vintage, never to NV
  ([ADR-0010](../adr/0010-a-vintage-is-a-year-nv-or-unknown.md)).
- **The images Vivino shows here are the owner's own photographs**, not studio bottle shots.
  Whether Vivino's catalogue image for the same Label is a studio shot is part of the measurement.
- No spirits yet.
