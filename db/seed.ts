import { registerHooks } from "node:module";
import { requireDatabaseUrl } from "./env.ts";

// A cellar to look at, for the local loop.
//
//   pnpm db:seed
//
// Fills an empty local database with a believable owner's record — Labels across the three
// sections, Vintages, Bottles closed and open at every Level, three months of Tastings, a
// few Labels left to check, Wishes and a Palate — so the web view can be judged with
// something in it. It goes through the same verbs the doors use, so every row it writes is
// one the app could have written.
//
// It refuses a database that already holds a Label, and one that is not on this machine:
// it is for a fresh `pnpm db:reset`, never for a copy someone keeps their record in. The
// days are counted back from today, so the diary always reads as recent.

// `src/core` is `server-only`; see `db/token.ts`, which says why this is written inline.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,export{}", shortCircuit: true };
    }
    return next(specifier, context);
  },
});

/** The day `n` days before today, as a day is written: `2026-10-12`. */
function daysAgo(n: number): string {
  const day = new Date();
  day.setDate(day.getDate() - n);
  return day.toISOString().slice(0, 10);
}

/** The moment `n` days ago, for when a Bottle was opened. */
function momentAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

async function main(): Promise<void> {
  const url = new URL(requireDatabaseUrl());
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    process.stderr.write(
      `refusing to seed ${url.hostname}: the seed is for a database on this machine\n`
    );
    process.exitCode = 1;
    return;
  }

  const { closePool, query } = await import("../src/core/db.ts");
  const { createLabel } = await import("../src/core/verbs/label.ts");
  const { ensureVintage } = await import("../src/core/verbs/vintage.ts");
  const { addBottles, openBottle, setBottleLevel, finishBottle } = await import(
    "../src/core/verbs/bottle.ts"
  );
  const { recordTasting } = await import("../src/core/verbs/tasting.ts");
  const { addWish, closeWish } = await import("../src/core/verbs/wish.ts");
  const { writePalate } = await import("../src/core/verbs/palate.ts");

  try {
    const [held] = await query<{ count: string }>("select count(*) from labels");
    if (Number(held?.count ?? 0) > 0) {
      process.stderr.write(
        "refusing to seed: this database already holds Labels. `pnpm db:reset` first.\n"
      );
      process.exitCode = 1;
      return;
    }

    // ── Wine ────────────────────────────────────────────────────────────────────
    const costasera = await createLabel({
      producer: "Masi",
      name: "Costasera",
      kindId: "kind_red",
      country: "Italy",
      region: "Veneto",
      appellation: "Amarone della Valpolicella Classico DOCG",
      grapes: ["Corvina", "Rondinella", "Molinara"],
      strength: 15,
      unverified: false,
      vintage: 2019,
    });
    const costasera2019 = await addBottles(costasera.vintageId, 2, {
      boughtOn: daysAgo(40),
      price: "42.00",
      boughtWhere: "Enoteca in town",
    });
    await openBottle(costasera2019[0] ?? "", { at: momentAgo(2) });
    await setBottleLevel(costasera2019[0] ?? "", "1/2");
    const costasera2016 = await ensureVintage(costasera.labelId, 2016);
    await recordTasting({
      vintageId: costasera.vintageId,
      tastedOn: daysAgo(2),
      rating: 4.5,
      likedIt: "Dried cherries, and warm all the way down. Better after an hour open.",
      bodyAndFeel: "Full, soft, a little sweet at first but dry at the end",
      food: "braised beef",
      place: "home",
    });
    await recordTasting({
      vintageId: costasera2016,
      tastedOn: daysAgo(80),
      rating: 4,
      likedIt: "Smells sweet, like raisins, but it is dry. Strong.",
      place: "a restaurant in Verona",
      company: "Giulia",
    });

    const barolo = await createLabel({
      producer: "Vietti",
      name: "Barolo Castiglione",
      kindId: "kind_red",
      country: "Italy",
      region: "Piemonte",
      appellation: "Barolo DOCG",
      grapes: ["Nebbiolo"],
      strength: 14.5,
      unverified: false,
      vintage: 2019,
    });
    await addBottles(barolo.vintageId, 2, { boughtOn: daysAgo(60), price: "48.00" });
    await recordTasting({
      vintageOf: { labelId: barolo.labelId, dating: 2018 },
      tastedOn: daysAgo(21),
      rating: 4.5,
      likedIt: "Cherries and violets, and it dries the mouth.",
      bodyAndFeel: "Light in colour but not in the mouth",
      remindedOf: "Dried roses",
      food: "tajarin with butter and sage",
    });

    const ama = await createLabel({
      producer: "Castello di Ama",
      name: "Ama",
      kindId: "kind_red",
      country: "Italy",
      region: "Toscana",
      appellation: "Chianti Classico DOCG",
      grapes: ["Sangiovese", "Merlot"],
      strength: 13.5,
      unverified: false,
      vintage: 2021,
    });
    await addBottles(ama.vintageId, 3, { boughtOn: daysAgo(30), price: "24.50" });
    await recordTasting({
      vintageId: ama.vintageId,
      tastedOn: daysAgo(30),
      rating: 3.5,
      likedIt: "Fresh, sour cherries. Easy.",
      food: "pizza",
      company: "friends",
    });

    const soave = await createLabel({
      producer: "Pieropan",
      name: "Soave Classico",
      kindId: "kind_white",
      country: "Italy",
      region: "Veneto",
      appellation: "Soave Classico DOC",
      grapes: ["Garganega"],
      strength: 12,
      unverified: false,
      vintage: 2023,
    });
    await addBottles(soave.vintageId, 2, { boughtOn: daysAgo(15), price: "16.00" });
    await recordTasting({
      vintageId: soave.vintageId,
      tastedOn: daysAgo(15),
      rating: 4,
      likedIt: "Almonds and a bit of lemon. Clean.",
      food: "risotto with peas",
    });

    const terlano = await createLabel({
      producer: "Cantina Terlano",
      name: "Pinot Bianco",
      kindId: "kind_white",
      country: "Italy",
      region: "Alto Adige",
      grapes: ["Pinot Bianco"],
      strength: 13.5,
      unverified: true,
      vintage: 2022,
    });
    const [terlanoBottle] = await addBottles(terlano.vintageId, 1);
    await openBottle(terlanoBottle ?? "", { at: momentAgo(1) });
    await setBottleLevel(terlanoBottle ?? "", "3/4");
    await recordTasting({
      vintageId: terlano.vintageId,
      tastedOn: daysAgo(1),
      rating: 3.5,
      likedIt: "Apple, and something like bread.",
      notes: "Too cold at first; better after ten minutes.",
    });

    const prestige = await createLabel({
      producer: "Ca' del Bosco",
      name: "Cuvée Prestige",
      kindId: "kind_sparkling",
      country: "Italy",
      region: "Lombardia",
      appellation: "Franciacorta DOCG",
      grapes: ["Chardonnay", "Pinot Nero", "Pinot Bianco"],
      strength: 12.5,
      unverified: false,
      vintage: "nv",
    });
    await addBottles(prestige.vintageId, 1, { boughtOn: daysAgo(10), price: "34.00" });
    await recordTasting({
      vintageId: prestige.vintageId,
      tastedOn: daysAgo(9),
      rating: 4,
      likedIt: "Fine bubbles, bread crust, very dry.",
      place: "the aperitivo",
    });

    const miraval = await createLabel({
      producer: "Miraval",
      name: "Miraval Rosé",
      kindId: "kind_rose",
      country: "France",
      region: "Provence",
      appellation: "Côtes de Provence AOP",
      grapes: ["Cinsault", "Grenache"],
      strength: 13,
      unverified: false,
      vintage: 2023,
    });
    await recordTasting({
      vintageId: miraval.vintageId,
      tastedOn: daysAgo(70),
      rating: 3,
      likedIt: "Pale and light. Strawberries, not much else.",
      place: "a beach bar",
    });

    const moscato = await createLabel({
      producer: "Ceretto",
      name: "Moscato d'Asti",
      kindId: "kind_sweet",
      country: "Italy",
      region: "Piemonte",
      appellation: "Moscato d'Asti DOCG",
      grapes: ["Moscato Bianco"],
      strength: 5.5,
      unverified: false,
      vintage: 2023,
    });
    await recordTasting({
      vintageId: moscato.vintageId,
      tastedOn: daysAgo(45),
      rating: 4,
      likedIt: "Peaches and grapes, sweet and fizzy, almost no alcohol.",
      food: "panettone",
    });

    const port = await createLabel({
      producer: "Taylor's",
      name: "10 Year Old Tawny",
      kindId: "kind_fortified",
      country: "Portugal",
      region: "Douro",
      appellation: "Porto DOC",
      ageStatement: "10 years",
      strength: 20,
      unverified: false,
      vintage: "nv",
    });
    const [portBottle] = await addBottles(port.vintageId, 1, { price: "28.00" });
    await openBottle(portBottle ?? "", { at: momentAgo(50) });
    await setBottleLevel(portBottle ?? "", "3/4");

    const carpano = await createLabel({
      producer: "Carpano",
      name: "Antica Formula",
      kindId: "kind_vermouth",
      country: "Italy",
      strength: 16.5,
      unverified: false,
    });
    const [carpanoBottle] = await addBottles(carpano.vintageId, 1);
    await openBottle(carpanoBottle ?? "", { at: momentAgo(35) });
    await setBottleLevel(carpanoBottle ?? "", "1/2");

    // ── Spirits ─────────────────────────────────────────────────────────────────
    const nikka = await createLabel({
      producer: "Nikka",
      name: "From the Barrel",
      kindId: "kind_whisky",
      country: "Japan",
      strength: 51.4,
      unverified: false,
    });
    const [nikkaBottle] = await addBottles(nikka.vintageId, 1, { price: "45.00" });
    await openBottle(nikkaBottle ?? "", { at: momentAgo(60) });
    await setBottleLevel(nikkaBottle ?? "", "1/2");
    await recordTasting({
      vintageId: nikka.vintageId,
      tastedOn: daysAgo(25),
      rating: 4.5,
      likedIt: "Vanilla and orange peel. Strong, a drop of water opens it.",
      bodyAndFeel: "Thick, warm",
    });

    const lagavulin = await createLabel({
      producer: "Lagavulin",
      name: "16 Year Old",
      kindId: "kind_whisky",
      country: "Scotland",
      region: "Islay",
      ageStatement: "16 years",
      strength: 43,
      unverified: false,
    });
    await addBottles(lagavulin.vintageId, 1, { price: "70.00", boughtWhere: "Duty free" });

    const hendricks = await createLabel({
      producer: "Hendrick's",
      name: "Hendrick's Gin",
      kindId: "kind_gin",
      country: "Scotland",
      strength: 41.4,
      unverified: false,
    });
    const [hendricksBottle] = await addBottles(hendricks.vintageId, 1);
    await openBottle(hendricksBottle ?? "", { at: momentAgo(90) });
    await setBottleLevel(hendricksBottle ?? "", "1/4");

    // Not found in any Source: left for the owner to check.
    const hedonya = await createLabel({
      name: "Hedonya Gin",
      kindId: "kind_gin",
      unverified: true,
    });
    const [hedonyaBottle] = await addBottles(hedonya.vintageId, 1);
    await openBottle(hedonyaBottle ?? "", { at: momentAgo(5) });
    await setBottleLevel(hedonyaBottle ?? "", "3/4");
    await recordTasting({
      vintageId: hedonya.vintageId,
      tastedOn: daysAgo(2),
      rating: 4,
      likedIt: "Citrus first, then something green, like rosemary.",
      food: "tonic and lots of ice",
    });

    const diplomatico = await createLabel({
      producer: "Diplomático",
      name: "Reserva Exclusiva",
      kindId: "kind_rum",
      country: "Venezuela",
      strength: 40,
      unverified: false,
    });
    await addBottles(diplomatico.vintageId, 1, { price: "38.00" });

    const nardini = await createLabel({
      producer: "Nardini",
      name: "Acquavite di Vinaccia Bianca",
      kindId: "kind_grappa",
      country: "Italy",
      region: "Veneto",
      strength: 50,
      unverified: false,
    });
    const [nardiniBottle] = await addBottles(nardini.vintageId, 1);
    await openBottle(nardiniBottle ?? "", { at: momentAgo(120) });
    await finishBottle(nardiniBottle ?? "", { at: momentAgo(20) });

    const montenegro = await createLabel({
      producer: "Montenegro",
      name: "Amaro Montenegro",
      kindId: "kind_liqueur_amaro",
      country: "Italy",
      strength: 23,
      unverified: false,
    });
    const [montenegroBottle] = await addBottles(montenegro.vintageId, 1);
    await openBottle(montenegroBottle ?? "", { at: momentAgo(40) });
    await setBottleLevel(montenegroBottle ?? "", "1/2");

    const vida = await createLabel({
      producer: "Del Maguey",
      name: "Vida",
      kindId: "kind_tequila_mezcal",
      country: "Mexico",
      strength: 42,
      unverified: true,
    });
    await recordTasting({
      vintageId: vida.vintageId,
      tastedOn: daysAgo(12),
      rating: 3.5,
      likedIt: "Smoke, then something sweet like roasted pepper.",
      place: "a cocktail bar",
    });

    // ── Sake, beer and more ─────────────────────────────────────────────────────
    const dassai = await createLabel({
      producer: "Asahi Shuzo",
      name: "Dassai 45",
      kindId: "kind_sake",
      country: "Japan",
      region: "Yamaguchi",
      strength: 16,
      unverified: false,
    });
    await addBottles(dassai.vintageId, 1);
    await recordTasting({
      vintageId: dassai.vintageId,
      tastedOn: daysAgo(9),
      rating: 5,
      likedIt: "Like a pear, and almost no burn. Cold was best.",
      food: "sushi",
      place: "Kenji",
    });

    const isaac = await createLabel({
      producer: "Baladin",
      name: "Isaac",
      kindId: "kind_beer",
      country: "Italy",
      region: "Piemonte",
      strength: 5,
      unverified: false,
    });
    await addBottles(isaac.vintageId, 4, { price: "4.50" });

    // ── Loose Tastings: something was drunk, no bottle kept ─────────────────────
    await recordTasting({
      description: "Primitivo by the glass",
      tastedOn: daysAgo(4),
      rating: 3.5,
      likedIt: "Jammy and soft. A bit too sweet for me.",
      place: "a wine bar",
      company: "friends",
    });
    await recordTasting({
      description: "A house white, nobody knew the producer",
      tastedOn: daysAgo(4),
      notes: "Forgettable.",
    });

    // ── Wishes ──────────────────────────────────────────────────────────────────
    const etna = await createLabel({
      producer: "Benanti",
      name: "Etna Rosso",
      kindId: "kind_red",
      country: "Italy",
      region: "Sicilia",
      appellation: "Etna DOC",
      grapes: ["Nerello Mascalese", "Nerello Cappuccio"],
      unverified: false,
    });
    await addWish({
      labelId: etna.labelId,
      why: "Lighter than an Amarone, with the same cherries.",
      cameFrom: "The assistant",
    });
    const yamazaki = await createLabel({
      producer: "Suntory",
      name: "Yamazaki 12",
      kindId: "kind_whisky",
      country: "Japan",
      ageStatement: "12 years",
      strength: 43,
      unverified: false,
    });
    await addWish({
      labelId: yamazaki.labelId,
      why: "Tasted at a bar in Milan. Want a bottle.",
      cameFrom: "A bar",
    });
    await addWish({
      vintageId: await ensureVintage(barolo.labelId, 2016),
      why: "The shop said 2016 was a great year for Barolo.",
      cameFrom: "The wine shop",
    });
    const bollinger = await createLabel({
      producer: "Bollinger",
      name: "Special Cuvée",
      kindId: "kind_sparkling",
      country: "France",
      region: "Champagne",
      appellation: "Champagne AOC",
      grapes: ["Pinot Noir", "Chardonnay", "Pinot Meunier"],
      strength: 12,
      unverified: false,
      vintage: "nv",
    });
    await addWish({
      labelId: bollinger.labelId,
      why: "For a birthday. Fuller than a Franciacorta, they say.",
      cameFrom: "A friend",
    });
    const gravner = await createLabel({
      producer: "Gravner",
      name: "Ribolla",
      kindId: "kind_orange",
      country: "Italy",
      region: "Friuli-Venezia Giulia",
      grapes: ["Ribolla Gialla"],
      unverified: false,
    });
    await addWish({
      labelId: gravner.labelId,
      why: "To find out what an orange wine is.",
      cameFrom: "The assistant",
    });

    // Closed ones, so the closed list has each ending.
    const boughtWish = await addWish({
      labelId: lagavulin.labelId,
      why: "Smoky, everyone says. Wanted to try one.",
      cameFrom: "The assistant",
    });
    await closeWish(boughtWish, "bought", { at: momentAgo(50) });
    const tastedWish = await addWish({
      labelId: dassai.labelId,
      why: "A sake to start with.",
      cameFrom: "The assistant",
    });
    await closeWish(tastedWish, "tasted", { at: momentAgo(9) });
    const droppedWish = await addWish({
      labelId: miraval.labelId,
      why: "Everyone posts it in summer.",
      cameFrom: "Instagram",
    });
    await closeWish(droppedWish, "dropped", { at: momentAgo(60) });

    await writePalate(
      [
        "Still learning. I like reds with dried fruit and some sweetness on the nose, like an",
        "Amarone, and I find very tannic young reds hard. Whites: fresh and clean rather than",
        "oaky. Bubbles dry. Spirits: Japanese whisky and gin with tonic; smoke is fine in small",
        "doses. Too sweet is the one thing I really don't enjoy.",
      ].join(" ")
    );

    const [labels] = await query<{ count: string }>("select count(*) from labels");
    const [tastings] = await query<{ count: string }>("select count(*) from tastings");
    const [bottles] = await query<{ count: string }>(
      "select count(*) from bottles where state <> 'finished'"
    );
    process.stdout.write(
      `seeded ${labels?.count} Labels, ${tastings?.count} Tastings, ${bottles?.count} Bottles in the house\n`
    );
  } finally {
    await closePool();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
