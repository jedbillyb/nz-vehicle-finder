// Hand-written blurbs for top makes. Used on /stats/:make pages to give
// each page unique editorial content for SEO. Keys are the uppercase MAKE
// value as stored in the Motor Vehicle Register.

export type MakeBlurb = {
  origin?: string;
  founded?: string;
  blurb: string;
};

export const MAKE_CONTENT: Record<string, MakeBlurb> = {
  TOYOTA: {
    origin: "Japan",
    founded: "1937",
    blurb:
      "Toyota is by some distance the most popular vehicle brand in New Zealand, dominating both the new and used import markets. The Hilux ute and the Corolla are perennial best-sellers, and the Aqua and Prius hybrids made early hybrid technology mainstream on Kiwi roads.",
  },
  FORD: {
    origin: "United States",
    founded: "1903",
    blurb:
      "Ford has a long history in New Zealand, with the Ranger ute consistently ranking among the country's top-selling new vehicles. Older Falcons and Territorys remain common on the used market thanks to their durability and Australian assembly heritage.",
  },
  HOLDEN: {
    origin: "Australia",
    founded: "1856",
    blurb:
      "Holden is no longer producing new vehicles, but its Commodores, Captivas and Colorados still account for a huge share of registered vehicles in New Zealand. The brand carries strong nostalgic value, especially among Kiwi V8 fans.",
  },
  MAZDA: {
    origin: "Japan",
    founded: "1920",
    blurb:
      "Mazda is consistently one of the best-selling brands in NZ, with the Demio (Mazda2), Axela (Mazda3) and CX-5 making up much of the fleet. Used Japanese imports keep older Mazdas highly visible on Kiwi roads.",
  },
  NISSAN: {
    origin: "Japan",
    founded: "1933",
    blurb:
      "Nissan is a top-five make in New Zealand, with everything from the Tiida and Note hatchbacks to the Navara ute and Patrol 4WD widely registered. The Leaf is also one of the most common EVs in the country thanks to used Japanese imports.",
  },
  MITSUBISHI: {
    origin: "Japan",
    founded: "1917",
    blurb:
      "Mitsubishi has a strong NZ presence with the Outlander PHEV, Triton ute and ASX SUV. Older Lancers and Pajeros remain popular as practical, affordable used buys.",
  },
  HONDA: {
    origin: "Japan",
    founded: "1948",
    blurb:
      "Honda's Civic, Jazz/Fit, CR-V and Odyssey models make up the bulk of its NZ registrations. Honda is well-regarded for reliability and fuel economy, with hybrid variants increasingly common on the used market.",
  },
  SUBARU: {
    origin: "Japan",
    founded: "1953",
    blurb:
      "Subaru's all-wheel-drive Legacy, Forester, Outback and Impreza are widely registered in New Zealand, particularly in alpine regions where AWD traction is valued.",
  },
  SUZUKI: {
    origin: "Japan",
    founded: "1909",
    blurb:
      "Suzuki specialises in small, efficient cars and compact SUVs. The Swift is a long-running favourite in NZ, joined more recently by the Vitara and Jimny.",
  },
  HYUNDAI: {
    origin: "South Korea",
    founded: "1967",
    blurb:
      "Hyundai has rapidly grown its NZ market share with the i30, Tucson, Santa Fe and Kona EV. The Ioniq 5 has become one of the most visible new electric vehicles on Kiwi roads.",
  },
  BMW: {
    origin: "Germany",
    founded: "1916",
    blurb:
      "BMW is the most-registered German premium brand in NZ. The 3 Series, 5 Series, X3 and X5 are common, as are used Japanese-import variants of nearly every model the company has made.",
  },
  "MERCEDES-BENZ": {
    origin: "Germany",
    founded: "1926",
    blurb:
      "Mercedes-Benz covers everything in NZ from C-Class sedans and Sprinter vans to GLC SUVs and the EQ electric range. Light commercial Sprinters dominate courier and motorhome conversions.",
  },
  VOLKSWAGEN: {
    origin: "Germany",
    founded: "1937",
    blurb:
      "Volkswagen's Golf, Polo, Tiguan and Amarok ute account for most NZ registrations. The ID range is gradually adding to VW's electric presence.",
  },
  KIA: {
    origin: "South Korea",
    founded: "1944",
    blurb:
      "Kia has surged in popularity in NZ with the Sportage, Seltos, Sorento and EV6. The brand is now consistently in the top ten new-vehicle sellers each month.",
  },
  AUDI: {
    origin: "Germany",
    founded: "1909",
    blurb:
      "Audi's A3, A4, Q5 and e-tron models are popular premium choices in NZ. Quattro all-wheel-drive variants are particularly common in the South Island.",
  },
  ISUZU: {
    origin: "Japan",
    founded: "1916",
    blurb:
      "Isuzu is best known in NZ for the D-Max ute and MU-X SUV, plus a substantial fleet of light and heavy trucks that dominate the freight industry.",
  },
  "LAND ROVER": {
    origin: "United Kingdom",
    founded: "1948",
    blurb:
      "Land Rover Discoverys, Defenders and Range Rovers have a strong following in rural New Zealand. Used UK and Japanese imports make older Discovery 2s and Defenders especially common.",
  },
  TESLA: {
    origin: "United States",
    founded: "2003",
    blurb:
      "Tesla is the most recognisable EV brand in New Zealand, with the Model 3 and Model Y leading registrations. Supported by the Supercharger network, Tesla has driven mainstream EV adoption in NZ.",
  },
  MINI: {
    origin: "United Kingdom",
    founded: "1959",
    blurb:
      "Mini's Cooper hatch and Countryman crossover are well-represented in NZ cities. Both new and used Japanese-import Minis are widely registered.",
  },
  LEXUS: {
    origin: "Japan",
    founded: "1989",
    blurb:
      "Lexus, Toyota's premium brand, has a strong used-import presence in NZ. The IS, RX and NX are common, with hybrid variants popular for their efficiency.",
  },
};

export function getMakeBlurb(makeUpper: string): MakeBlurb {
  return (
    MAKE_CONTENT[makeUpper] ?? {
      blurb: `${formatMake(makeUpper)} vehicles are registered with the New Zealand Motor Vehicle Register. Browse the full list below to see registration counts, model breakdowns and regional distribution.`,
    }
  );
}

function formatMake(upper: string): string {
  return upper
    .toLowerCase()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
