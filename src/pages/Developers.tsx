import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { applySeo } from "@/lib/seo";
import { BURST_PER_SECOND, TIERS, TIER_ORDER } from "../../shared/apiTiers";
import { MAX_PAGE_SIZE, MIN_PAGE_SIZE, DEFAULT_PAGE_SIZE } from "../../shared/pagination";
import { Band, PageShell } from "@/components/PageShell";
import { code } from "@/lib/pageStyles";

/*
 * Laid out like the Stripe and Resend API references: each endpoint is one
 * block with a short description and a parameter table on the left, and the
 * request and response on the right (stacked on phones).
 */

const BASE = "https://vehiclefinder.co.nz/api/v1";
const CONTACT = "mailto:hello@jedbillyb.com?subject=Custom%20vehicle%20data";

const TEXT_FIELDS = [
  "MAKE", "MODEL", "SUBMODEL", "BASIC_COLOUR", "MOTIVE_POWER", "BODY_TYPE", "TRANSMISSION_TYPE",
  "TLA", "POSTCODE", "IMPORT_STATUS", "ORIGINAL_COUNTRY", "CLASS", "INDUSTRY_CLASS",
  "ROAD_TRANSPORT_CODE", "VEHICLE_USAGE", "NZ_ASSEMBLED", "VIN11",
];
const NUMBER_FIELDS = [
  "VEHICLE_YEAR", "CC_RATING", "POWER_RATING", "GROSS_VEHICLE_MASS", "WIDTH", "NUMBER_OF_SEATS", "NUMBER_OF_AXLES",
];

function Pre({ title, children }: { title?: string; children: string }) {
  return (
    <div style={{ borderRadius: 8, overflow: "hidden", background: "#0f172a", minWidth: 0 }}>
      {title && <div style={{ fontSize: 11, color: "#94a3b8", padding: "8px 14px", borderBottom: "1px solid #1e293b", fontWeight: 600 }}>{title}</div>}
      <pre style={{ ...code, color: "#e2e8f0", padding: "12px 14px", overflowX: "auto", margin: 0, lineHeight: 1.6 }}>{children}</pre>
    </div>
  );
}

function C({ children }: { children: ReactNode }) {
  return <code style={{ ...code, background: "#f3f4f6", padding: "1px 5px", borderRadius: 4 }}>{children}</code>;
}

const cell: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #f3f4f6", verticalAlign: "top", textAlign: "left" };

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>{head.map((h) => <th key={h} style={{ ...cell, fontSize: 11, color: "#6b7280", fontWeight: 600, borderBottom: "1px solid #e5e7eb" }}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={cell}>{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

/** Parameter row: name, type, description. */
type Param = [name: string, type: string, desc: ReactNode];

function Endpoint({ path, summary, params, request, response, tone }: {
  path: string; summary: ReactNode; params?: Param[]; request: string; response: string; tone?: "white" | "grey";
}) {
  const id = path.replace(/[^a-z]+/gi, "-").replace(/^-|-$/g, "");
  return (
    <Band tone={tone}>
      <div id={id} className="doc-endpoint">
        <div style={{ minWidth: 0 }}>
          <h3 style={{ ...code, fontSize: 16, margin: "0 0 8px", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ background: "#dcfce7", color: "#15803d", fontSize: 11, fontWeight: 700, padding: "2px 6px", borderRadius: 4 }}>GET</span>
            <span style={{ color: "#0f172a" }}>{path}</span>
          </h3>
          <p style={{ margin: "0 0 14px", fontSize: 14, color: "#374151", lineHeight: 1.6 }}>{summary}</p>
          {params && (
            <Table
              head={["Parameter", "Type", "Description"]}
              rows={params.map(([n, t, d]) => [<C>{n}</C>, <span style={{ color: "#6b7280" }}>{t}</span>, d])}
            />
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
          <Pre title="Request">{request}</Pre>
          <Pre title="Response">{response}</Pre>
        </div>
      </div>
    </Band>
  );
}

const anyFilter: Param = ["any filter", "string", <>Narrow the vehicles counted. See <a href="#filters" style={{ color: "#0369a1" }}>Filters</a>.</>];

export default function Developers() {
  useEffect(() => {
    applySeo({
      title: "NZ Vehicle Register API | NZ Vehicle Finder",
      description:
        "A JSON API over the full NZ Motor Vehicle Register: search 5.9 million vehicles and count them by make, model, year, fuel, region and more. Free tier included.",
      keywords: "NZ vehicle API, NZTA motor vehicle register API, NZ car data API, New Zealand vehicle data",
      canonical: "https://vehiclefinder.co.nz/developers",
    });
  }, []);

  const p = { fontSize: 14, color: "#374151", lineHeight: 1.6, margin: "0 0 12px", maxWidth: 760 } as const;

  return (
    <PageShell
      source="developers_page"
      subtitle="Developer API"
      crumb="Developers"
      title="NZ Vehicle Register API"
      intro="Every vehicle on the NZ Motor Vehicle Register as JSON. Search it, or count it any way you like. Refreshed automatically each month from NZTA."
      heroApi={{ to: "/account", title: "Get an API key", sub: "500 free requests a month" }}
    >
      <Band title="Quick start" tone="grey">
        <div className="doc-endpoint">
          <ol style={{ ...p, paddingLeft: 20, listStyle: "decimal" }}>
            <li><Link to="/account" style={{ color: "#0369a1", fontWeight: 600 }}>Sign in</Link> with your email. No password, no card.</li>
            <li>Create a key on your account page.</li>
            <li>Send it as a Bearer token. That's it.</li>
          </ol>
          <Pre title="Request">{`curl -G ${BASE}/vehicles \\
  -H "Authorization: Bearer nzvf_your_key" \\
  -d MAKE=TOYOTA \\
  -d MODEL=AQUA`}</Pre>
        </div>
      </Band>

      <Band title="Authentication">
        <p style={p}>
          Send your key in the <C>Authorization: Bearer</C> header (or <C>X-API-Key</C>). Keep it on your server: anyone with
          the key can spend your quota. Lost a key? Revoke it and make a new one on your <Link to="/account" style={{ color: "#0369a1" }}>account page</Link>.
        </p>
        <p style={{ ...p, margin: 0 }}>
          Base URL: <C>{BASE}</C>. Every response is <C>{"{ data, source }"}</C>, where <C>source</C> holds the snapshot date
          and the NZTA credit line. The data is CC BY 4.0: if you publish it, credit NZTA.
        </p>
      </Band>

      <Endpoint
        tone="grey"
        path="/vehicles"
        summary="Search the register. Returns one page of matching vehicles and the total count."
        params={[
          anyFilter,
          ["page", "integer", "Page number, from 1."],
          ["limit", "integer", `Vehicles per page, ${MIN_PAGE_SIZE} to ${MAX_PAGE_SIZE}. Default ${DEFAULT_PAGE_SIZE}.`],
        ]}
        request={`curl -G ${BASE}/vehicles \\
  -H "Authorization: Bearer $KEY" \\
  -d MAKE=TESLA \\
  -d TLA=AUCKLAND \\
  -d limit=100`}
        response={`{
  "data": {
    "vehicles": [
      { "MAKE": "TESLA", "MODEL": "MODEL 3",
        "VEHICLE_YEAR": "2021", ... }
    ],
    "total": 8123,
    "page": 1,
    "pages": 82,
    "limit": 100
  },
  "source": { ... }
}`}
      />

      <Endpoint
        path="/breakdown"
        summary={<>Count vehicles grouped by any field. Use it for a full breakdown, e.g. every model Toyota sells and how many are on the road, without paging through vehicles. One call is one request, however many values come back.</>}
        params={[
          ["by", "string", <>Up to 5 fields, comma separated. Default: fuel, colour, body, transmission and make.</>],
          ["limit", "integer", "Values per field, 1 to 1,000, largest first. Default 50."],
          anyFilter,
        ]}
        request={`curl -G ${BASE}/breakdown \\
  -H "Authorization: Bearer $KEY" \\
  -d by=MODEL,VEHICLE_YEAR \\
  -d MAKE=TOYOTA`}
        response={`{
  "data": {
    "total": 1087654,
    "groups": {
      "MODEL": [
        { "value": "COROLLA", "count": 151204 },
        { "value": "HILUX", "count": 98311 }, ...
      ],
      "VEHICLE_YEAR": [ ... ]
    }
  },
  "source": { ... }
}`}
      />

      <Endpoint
        tone="grey"
        path="/values/{field}"
        summary="The distinct values of one field, commonest first. Handy for building dropdowns."
        params={[
          ["q", "string", "Only values containing this text."],
          ["limit", "integer", "Up to 1,000."],
          anyFilter,
        ]}
        request={`curl -G ${BASE}/values/MODEL \\
  -H "Authorization: Bearer $KEY" \\
  -d MAKE=MAZDA \\
  -d q=CX`}
        response={`{
  "data": ["CX-5", "CX-3", "CX-8", "CX-30"],
  "source": { ... }
}`}
      />

      <Endpoint
        path="/makes/{make}/models"
        summary={<>The 24 most registered models of a make, with counts. Write spaces as <C>_</C>, e.g. <C>LAND_ROVER</C>.</>}
        request={`curl ${BASE}/makes/LAND_ROVER/models \\
  -H "Authorization: Bearer $KEY"`}
        response={`{
  "data": [
    { "model": "DISCOVERY", "count": 15234 }, ...
  ],
  "source": { ... }
}`}
      />

      <Endpoint
        tone="grey"
        path="/fleet"
        summary="Fleet-wide totals: fuel types, top makes, body types, import status and vehicles per region."
        request={`curl ${BASE}/fleet \\
  -H "Authorization: Bearer $KEY"`}
        response={`{
  "data": {
    "total": 5905376,
    "fuelTypes": [ ... ],
    "topMakes": [ ... ],
    "regions": [ ... ],
    "snapshotDate": "2026-08-31"
  },
  "source": { ... }
}`}
      />

      <Band title={<span id="filters">Filters</span>}>
        <p style={p}>Any endpoint above takes these as query parameters. Matching ignores case.</p>
        <div style={{ maxWidth: 760, marginBottom: 16 }}>
          <Table
            head={["Write", "Matches"]}
            rows={[
              [<C>MAKE=TOYOTA</C>, "Exactly TOYOTA"],
              [<C>MAKE=TOYOTA,NISSAN</C>, <>Either one. Write a literal comma as <C>\,</C></>],
              [<C>TRANSMISSION_TYPE=~MANUAL</C>, "Anything containing MANUAL"],
              [<C>VEHICLE_YEAR_MIN=2015</C>, "2015 or newer (number fields only, also _MAX)"],
            ]}
          />
        </div>
        <Table
          head={["Kind", "Fields"]}
          rows={[
            ["Text", <span style={{ ...code, lineHeight: 1.8 }}>{TEXT_FIELDS.join(", ")}</span>],
            ["Number", <span style={{ ...code, lineHeight: 1.8 }}>{NUMBER_FIELDS.join(", ")}</span>],
          ]}
        />
      </Band>

      <Band title="Limits and errors" tone="grey">
        <p style={p}>
          Each call uses one request from your monthly quota, which resets on the 1st (UTC). One key can make
          up to {BURST_PER_SECOND} calls a second. Every response has <C>X-RateLimit-Remaining</C> and <C>X-RateLimit-Reset</C> headers.
        </p>
        <div style={{ maxWidth: 760 }}>
          <Table
            head={["Status", "Meaning"]}
            rows={[
              [<C>400</C>, "A parameter is wrong, e.g. an unknown field. The error says which."],
              [<C>401</C>, "Missing, unknown or revoked key."],
              [<C>404</C>, "Unknown endpoint."],
              [<C>429</C>, `Monthly quota used up, or over ${BURST_PER_SECOND} calls a second. Throttled calls are not counted.`],
              [<C>503</C>, "Restarting after the monthly data refresh. Retry in a few seconds."],
            ]}
          />
        </div>
      </Band>

      <Band title="Pricing">
        <div className="doc-pricing">
          {TIER_ORDER.map((id) => TIERS[id]).map((t) => (
            <div key={t.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "18px 20px", background: "#ffffff" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#6b7280" }}>{t.name}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", margin: "4px 0" }}>
                {t.priceNzd === 0 ? "Free" : `NZ$${t.priceNzd}`}
                {t.priceNzd > 0 && <span style={{ fontSize: 13, fontWeight: 500, color: "#6b7280" }}> / month</span>}
              </div>
              <div style={{ fontSize: 13, color: "#374151" }}>{t.monthlyRequests.toLocaleString("en-NZ")} requests a month</div>
            </div>
          ))}
          <div style={{ border: "1px solid #bae6fd", borderRadius: 10, padding: "18px 20px", background: "#f0f9ff" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#0369a1" }}>Custom</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", margin: "4px 0" }}>Quote</div>
            <div style={{ fontSize: 13, color: "#374151" }}>Bulk extracts and one-off breakdowns</div>
          </div>
        </div>
        <p style={{ ...p, margin: "14px 0 0" }}>
          <Link to="/account" style={{ color: "#0369a1", fontWeight: 600 }}>Start free</Link>, upgrade any time. Card payments by Stripe, cancel whenever.
        </p>
      </Band>

      <Band title="Custom data and full breakdowns" tone="grey">
        <p style={p}>
          Need the whole register as a file, a breakdown the API doesn't cover, or a regular report? Skip the NZTA
          data request and tell us what you want. You get it as CSV or JSON, usually within a couple of days.
        </p>
        <p style={{ ...p, fontSize: 13, color: "#6b7280" }}>
          Open register data only. Owner names and addresses are not in the public register and can't be supplied.
        </p>
        <a href={CONTACT} style={{ display: "inline-block", background: "#0ea5e9", color: "#ffffff", fontWeight: 700, fontSize: 14, padding: "10px 18px", borderRadius: 8, textDecoration: "none" }}>
          Ask for a quote
        </a>
      </Band>
    </PageShell>
  );
}
