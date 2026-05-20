// Slug conventions for /stats/:make/:model URLs.
// Model names in the NZ Motor Vehicle Register can contain both spaces
// ("YARIS CROSS") and hyphens ("CX-5"). Using underscores for spaces keeps
// the round-trip unambiguous: "YARIS CROSS" <-> "yaris_cross", "CX-5" <-> "cx-5".
//
// Make slugs use hyphens-for-spaces (existing convention, must not change to
// avoid breaking indexed URLs). The slug-to-DB conversion uses a lookup table
// for makes whose names contain spaces, since slug.toUpperCase() would produce
// "LAND-ROVER" instead of "LAND ROVER".

export function modelToSlug(model: string): string {
  return model.trim().toLowerCase().replace(/\s+/g, "_");
}

export function slugToModel(slug: string): string {
  return slug.replace(/_/g, " ").toUpperCase();
}

export function titleCaseModel(model: string): string {
  return model
    .split(" ")
    .map((w) => (w.includes("-") ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

// Maps URL slug -> exact MAKE value stored in the NZ Motor Vehicle Register.
// Only needed for makes whose names contain spaces (since slug.toUpperCase()
// would produce "LAND-ROVER" instead of "LAND ROVER").
const MAKE_SLUG_LOOKUP: Record<string, string> = {
  "land-rover": "LAND ROVER",
  "harley-davidson": "HARLEY DAVIDSON",
  "john-deere": "JOHN DEERE",
  "great-wall": "GREAT WALL",
  "mitsubishi-fuso": "MITSUBISHI FUSO",
  "alfa-romeo": "ALFA ROMEO",
  "massey-ferguson": "MASSEY FERGUSON",
  "mobile-machine": "MOBILE MACHINE",
  "new-holland": "NEW HOLLAND",
  "royal-enfield": "ROYAL ENFIELD",
  "ud-trucks": "UD TRUCKS",
  "case-ih": "CASE IH",
  "moto-guzzi": "MOTO GUZZI",
  "tnt-motor": "TNT MOTOR",
  "transport-trailers": "TRANSPORT TRAILERS",
  "aakron-xpress": "AAKRON XPRESS",
  "ci-munro": "CI MUNRO",
  "chrysler-jeep": "CHRYSLER JEEP",
  "aston-martin": "ASTON MARTIN",
  "toko-trailers": "TOKO TRAILERS",
  "western-star": "WESTERN STAR",
  "range-rover": "RANGE ROVER",
  "alexander-dennis": "ALEXANDER DENNIS",
  "david-brown": "DAVID BROWN",
  "toyota-lexus": "TOYOTA LEXUS",
  "mv-agusta": "MV AGUSTA",
  "factory-built": "FACTORY BUILT",
};

export function slugToMakeUpper(slug: string): string {
  return MAKE_SLUG_LOOKUP[slug] ?? slug.toUpperCase();
}
