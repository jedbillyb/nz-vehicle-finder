// Slug conventions for /stats/:make/:model URLs.
// Model names in the NZ Motor Vehicle Register can contain both spaces
// ("YARIS CROSS") and hyphens ("CX-5"). Using underscores for spaces keeps
// the round-trip unambiguous: "YARIS CROSS" <-> "yaris_cross", "CX-5" <-> "cx-5".

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
