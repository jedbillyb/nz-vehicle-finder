type SeoOptions = {
  title: string;
  description: string;
  canonical: string;
  image?: string;
  type?: string;
  noindex?: boolean;
  jsonLd?: object[];
};

const JSON_LD_ID = "lov-jsonld";

function applyJsonLd(blocks: object[]) {
  // Remove previously injected JSON-LD blocks.
  document.head
    .querySelectorAll(`script[data-id="${JSON_LD_ID}"]`)
    .forEach((el) => el.remove());

  for (const block of blocks) {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-id", JSON_LD_ID);
    script.textContent = JSON.stringify(block);
    document.head.appendChild(script);
  }
}

function upsertMeta(selector: string, attrs: Record<string, string>) {
  const existing = document.head.querySelector<HTMLMetaElement>(selector);
  const tag = existing ?? document.createElement("meta");

  for (const [key, value] of Object.entries(attrs)) {
    tag.setAttribute(key, value);
  }

  if (!existing) document.head.appendChild(tag);
}

function upsertLink(rel: string, href: string) {
  const existing = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  const tag = existing ?? document.createElement("link");
  tag.setAttribute("rel", rel);
  tag.setAttribute("href", href);
  if (!existing) document.head.appendChild(tag);
}

export function applySeo({
  title,
  description,
  canonical,
  image = "https://vehiclefinder.co.nz/og-image.svg",
  type = "website",
  noindex = false,
  jsonLd,
}: SeoOptions) {
  document.title = title;
  applyJsonLd(jsonLd ?? []);

  upsertLink("canonical", canonical);

  upsertMeta('meta[name="description"]', {
    name: "description",
    content: description,
  });

  upsertMeta('meta[name="robots"]', {
    name: "robots",
    content: noindex ? "noindex,nofollow" : "index,follow",
  });

  upsertMeta('meta[property="og:title"]', {
    property: "og:title",
    content: title,
  });
  upsertMeta('meta[property="og:description"]', {
    property: "og:description",
    content: description,
  });
  upsertMeta('meta[property="og:url"]', {
    property: "og:url",
    content: canonical,
  });
  upsertMeta('meta[property="og:type"]', {
    property: "og:type",
    content: type,
  });
  upsertMeta('meta[property="og:image"]', {
    property: "og:image",
    content: image,
  });

  upsertMeta('meta[name="twitter:title"]', {
    name: "twitter:title",
    content: title,
  });
  upsertMeta('meta[name="twitter:description"]', {
    name: "twitter:description",
    content: description,
  });
  upsertMeta('meta[name="twitter:image"]', {
    name: "twitter:image",
    content: image,
  });
}
