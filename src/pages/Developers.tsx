import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { applySeo } from "@/lib/seo";
import { captureEvent } from "@/lib/posthog";
import { fetchFleetOverview, type FleetOverview } from "@/lib/vehicleApi";
import { BURST_PER_SECOND, TIERS, TIER_ORDER } from "../../shared/apiTiers";
import { MAX_PAGE_SIZE, MIN_PAGE_SIZE, DEFAULT_PAGE_SIZE } from "../../shared/pagination";
import { Band, PageShell, StatCard } from "@/components/PageShell";
import { code, label } from "@/lib/pageStyles";

const BASE = "https://vehiclefinder.co.nz/api/v1";

const FILTER_FIELDS = [
  "MAKE", "MODEL", "SUBMODEL", "BASIC_COLOUR", "MOTIVE_POWER", "BODY_TYPE", "TRANSMISSION_TYPE",
  "TLA", "POSTCODE", "IMPORT_STATUS", "ORIGINAL_COUNTRY", "CLASS", "INDUSTRY_CLASS",
  "ROAD_TRANSPORT_CODE", "VEHICLE_USAGE", "NZ_ASSEMBLED", "VIN11",
];
const RANGE_FIELDS = [
  "VEHICLE_YEAR", "CC_RATING", "POWER_RATING", "GROSS_VEHICLE_MASS", "WIDTH", "NUMBER_OF_SEATS", "NUMBER_OF_AXLES",
];

function Pre({ children }: { children: string }) {
  return (
    <pre style={{ ...code, background: "#0f172a", color: "#e2e8f0", padding: "12px 14px", borderRadius: 6, overflowX: "auto", margin: "8px 0 0", lineHeight: 1.6 }}>
      {children}
    </pre>
  );
}

function C({ children }: { children: ReactNode }) {
  return <code style={{ ...code, background: "#f3f4f6", padding: "1px 5px", borderRadius: 4 }}>{children}</code>;
}

function Section({ title, tone, children }: { title: string; tone?: "white" | "grey"; children: ReactNode }) {
  return (
    <Band title={title} tone={tone}>
      <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.6, maxWidth: 900 }}>{children}</div>
    </Band>
  );
}

function Endpoint({ path, children, example }: { path: string; children: ReactNode; example: string }) {
  return (
    <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: 14, marginTop: 14 }}>
      <div style={{ ...code, fontSize: 14, fontWeight: 700, color: "#0369a1" }}>GET {path}</div>
      <div style={{ marginTop: 6 }}>{children}</div>
      <Pre>{example}</Pre>
    </div>
  );
}

export default function Developers() {
  const [fleet, setFleet] = useState<FleetOverview | null>(null);
  useEffect(() => {
    fetchFleetOverview().then(setFleet).catch(() => {});
  }, []);

  useEffect(() => {
    applySeo({
      title: "NZ Vehicle Register API | NZ Vehicle Finder",
      description:
        "A JSON API over the full NZ Motor Vehicle Register: search 5.9 million vehicles by make, model, year, fuel, region and more. Free tier included.",
      keywords: "NZ vehicle API, NZTA motor vehicle register API, NZ car data API, New Zealand vehicle data",
      canonical: "https://vehiclefinder.co.nz/developers",
    });
  }, []);

  return (
    <PageShell
      source="developers_page"
      subtitle="Developer API"
      crumb="Developers"
      title="NZ Vehicle Register API"
      intro="JSON access to every vehicle on the NZ Motor Vehicle Register. Search by make, model, year, fuel type, region and more, refreshed automatically each month from NZTA."
      heroApi={{ to: "/account", title: "GET AN API KEY", sub: "500 REQUESTS / MONTH FREE" }}
    >
      <div style={{ padding: "20px 24px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb", display: "flex", flexWrap: "wrap", gap: 12 }}>
        <StatCard label="VEHICLES" value={fleet ? fleet.total.toLocaleString("en-NZ") : "5.9M"} sub="Every vehicle on the register" />
        <StatCard label="DATA AS AT" value={fleet?.snapshotDate ?? "Monthly"} sub="Refreshed automatically from NZTA" />
        <StatCard label="ENDPOINTS" value="4" sub="Search, values, models, fleet" />
        <StatCard label="FREE TIER" value={TIERS.free.monthlyRequests.toLocaleString("en-NZ")} sub="Requests a month, no card" />
      </div>

      <Section title="Quick start">
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          <li><Link to="/account" style={{ color: "#0369a1" }}>Sign in</Link> with your email and create a key.</li>
          <li>Send it in the <C>Authorization</C> header:</li>
        </ol>
        <Pre>{`curl -H "Authorization: Bearer nzvf_your_key" \\
  "${BASE}/vehicles?MAKE=TOYOTA&MODEL=AQUA&VEHICLE_YEAR_MIN=2015"`}</Pre>
        <p style={{ margin: "10px 0 0" }}>
          <C>X-API-Key: nzvf_...</C> works too. Keep keys server-side: anyone with your key can spend your quota.
        </p>
      </Section>

      <Section title="Responses" tone="grey">
        Every successful response wraps the result in <C>data</C> and adds a <C>source</C> block with the snapshot date:
        <Pre>{`{
  "data": { ... },
  "source": {
    "name": "NZTA Motor Vehicle Register",
    "licence": "CC BY 4.0",
    "attribution": "Contains data from the NZ Transport Agency Motor Vehicle Register, licensed under CC BY 4.0.",
    "snapshot_date": "2026-08-31"
  }
}`}</Pre>
        <p style={{ margin: "10px 0 0" }}>
          The data is NZTA open data under CC BY 4.0. If you publish it, credit NZTA using the <C>attribution</C> text.
        </p>
      </Section>

      <Section title="Endpoints">
        <Endpoint path="/vehicles" example={`curl -H "Authorization: Bearer $KEY" \\
  "${BASE}/vehicles?MAKE=TESLA&TLA=AUCKLAND&limit=100&page=2"

{ "data": { "vehicles": [ { "MAKE": "TESLA", "MODEL": "MODEL 3", ... } ],
            "total": 8123, "page": 2, "pages": 82, "limit": 100 }, ... }`}>
          Search the register. Takes any of the filters below, plus <C>page</C> (from 1) and <C>limit</C> ({MIN_PAGE_SIZE} to {MAX_PAGE_SIZE}, default {DEFAULT_PAGE_SIZE}).
        </Endpoint>
        <Endpoint path="/values/{field}" example={`curl -H "Authorization: Bearer $KEY" \\
  "${BASE}/values/MODEL?MAKE=MAZDA&q=CX"

{ "data": ["CX-5", "CX-3", "CX-8", "CX-30", ...], ... }`}>
          Distinct values of one filter field, commonest first. <C>q</C> narrows by text, <C>limit</C> caps the list (up to 1,000), and any
          other filters restrict it to values that still return vehicles.
        </Endpoint>
        <Endpoint path="/makes/{make}/models" example={`curl -H "Authorization: Bearer $KEY" "${BASE}/makes/LAND_ROVER/models"

{ "data": [ { "model": "DISCOVERY", "count": 15234 }, ... ], ... }`}>
          The 24 most registered models of a make, with counts. Write spaces in the make as <C>_</C>.
        </Endpoint>
        <Endpoint path="/fleet" example={`curl -H "Authorization: Bearer $KEY" "${BASE}/fleet"

{ "data": { "total": 5905376, "fuelTypes": [...], "topMakes": [...],
            "bodyTypes": [...], "importStatus": [...], "regions": [...],
            "snapshotDate": "2026-08-31" }, ... }`}>
          Fleet-wide totals: fuel types, top makes, body types, import status and vehicles per region.
        </Endpoint>
      </Section>

      <Section title="Filters" tone="grey">
        <p style={{ margin: "0 0 8px" }}>Pass filters as query parameters. Matching ignores case.</p>
        <ul style={{ margin: "0 0 10px", paddingLeft: 20 }}>
          <li><C>MAKE=TOYOTA</C> matches exactly.</li>
          <li><C>MAKE=TOYOTA,NISSAN</C> matches either. Escape a literal comma as <C>\,</C>.</li>
          <li><C>TRANSMISSION_TYPE=~MANUAL</C> matches any value containing the text.</li>
          <li><C>VEHICLE_YEAR_MIN=2015&VEHICLE_YEAR_MAX=2020</C> is an inclusive range, for numeric fields.</li>
        </ul>
        <div style={label}>Text fields</div>
        <p style={{ ...code, margin: "0 0 10px", lineHeight: 1.8 }}>{FILTER_FIELDS.join("  ")}</p>
        <div style={label}>Numeric fields (also take _MIN / _MAX)</div>
        <p style={{ ...code, margin: 0, lineHeight: 1.8 }}>{RANGE_FIELDS.join("  ")}</p>
      </Section>

      <Section title="Limits and errors">
        <p style={{ margin: "0 0 8px" }}>
          Each request counts against your monthly quota, which resets on the 1st (UTC). Every response carries
          <C>X-RateLimit-Limit</C>, <C>X-RateLimit-Remaining</C> and <C>X-RateLimit-Reset</C>. Separately, one key may make
          at most {BURST_PER_SECOND} requests per second; throttled requests are not counted.
        </p>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li><C>401</C> missing, unknown or revoked key</li>
          <li><C>404</C> unknown endpoint</li>
          <li><C>429</C> monthly quota used up, or over {BURST_PER_SECOND} requests per second</li>
          <li><C>502</C> / <C>503</C> the API is restarting after the monthly data refresh; retry after a few seconds</li>
        </ul>
      </Section>

      <Section title="Pricing" tone="grey">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {TIER_ORDER.map((id) => TIERS[id]).map((t) => (
            <StatCard
              key={t.id}
              label={t.name.toUpperCase()}
              value={t.priceNzd === 0 ? "Free" : `NZ$${t.priceNzd}`}
              sub={`${t.monthlyRequests.toLocaleString("en-NZ")} requests / month${t.priceNzd ? " · billed monthly" : ""}`}
            />
          ))}
        </div>
        <p style={{ margin: "12px 0 0" }}>
          <Link to="/account" style={{ color: "#0369a1", fontWeight: 600 }}>Sign in to upgrade</Link>. Payments are handled by Stripe and you can cancel any time.
        </p>
        <p style={{ margin: "10px 0 0", fontSize: 13, color: "#6b7280" }}>
          Need more? Email <a href="mailto:hello@jedbillyb.com" style={{ color: "#0369a1" }}>hello@jedbillyb.com</a>.
        </p>
      </Section>
    </PageShell>
  );
}
