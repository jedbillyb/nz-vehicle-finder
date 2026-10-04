import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { applySeo } from "@/lib/seo";
import { BURST_PER_SECOND, TIERS, TIER_ORDER } from "../../shared/apiTiers";
import { MAX_PAGE_SIZE, MIN_PAGE_SIZE, DEFAULT_PAGE_SIZE } from "../../shared/pagination";
import { PageShell } from "@/components/PageShell";
import { DocLayout, DocSection as Section, Split, type DocNavGroup } from "@/components/DocLayout";
import { captureEvent } from "@/lib/posthog";
import { code } from "@/lib/pageStyles";
import { CONTACT_EMAIL } from "../../shared/contact";

/*
 * Laid out like the Stripe and Resend API references: a sticky menu on the
 * left, and each section split in two, the explanation and parameters on the
 * left with its request and response beside it on the right. Below 1100px the
 * code drops under the text; below 900px the menu becomes a row of chips.
 */

const BASE = "https://vehiclefinder.co.nz/api/v1";
const CONTACT =
  `mailto:${CONTACT_EMAIL.support}?subject=` +
  encodeURIComponent("Custom report request") +
  "&body=" +
  encodeURIComponent("Which report (model, market, extract or monthly):\nWhich vehicles (make, model, years, region...):\nFormat (PDF, CSV, both):\nOne-off or every month:\n");

/** What the custom service offers, all built from the public register. */
const OFFERS = [
  {
    title: "Model report",
    example: "e.g. every Toyota Aqua in NZ",
    includes: ["How many are on the road", "Ages and year-by-year counts", "Submodels, engines, colours", "Where they're registered", "NZ new vs imported"],
  },
  {
    title: "Market report",
    example: "e.g. EVs in Canterbury, utes since 2018",
    includes: ["Top makes and models", "Fuel and body type mix", "Region by region split", "Fleet age profile"],
  },
  {
    title: "Data extract",
    example: "e.g. every 2015+ diesel, as CSV",
    includes: ["Any slice of the register", "Or the whole thing", "CSV or JSON", "Columns of your choice"],
  },
  {
    title: "Monthly update",
    example: "Any of the above, refreshed",
    includes: ["Re-run when NZTA publishes", "Emailed to you each month", "Spot changes in the fleet"],
  },
];

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

function endpointId(path: string) {
  return path.replace(/[^a-z]+/gi, "-").replace(/^-|-$/g, "");
}

function Endpoint({ path, summary, params, request, response }: {
  path: string; summary: ReactNode; params?: Param[]; request: string; response: string;
}) {
  return (
    <Section id={endpointId(path)}>
      <Split
        left={
          <>
            <h2 style={{ ...code, fontSize: 18, margin: "0 0 10px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ background: "#dcfce7", color: "#15803d", fontSize: 11, fontWeight: 700, padding: "2px 6px", borderRadius: 4 }}>GET</span>
              <span style={{ color: "#0f172a" }}>{path}</span>
            </h2>
            <p style={{ margin: "0 0 16px", fontSize: 14, color: "#374151", lineHeight: 1.6 }}>{summary}</p>
            {params ? (
              <Table
                head={["Parameter", "Type", "Description"]}
                rows={params.map(([n, t, d]) => [<span style={{ whiteSpace: "nowrap" }}><C>{n}</C></span>, <span style={{ color: "#6b7280" }}>{t}</span>, d])}
              />
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>No parameters.</p>
            )}
          </>
        }
        right={
          <>
            <Pre title="Request">{request}</Pre>
            <Pre title="Response">{response}</Pre>
          </>
        }
      />
    </Section>
  );
}

const ENDPOINTS = ["/vehicles", "/breakdown", "/values/{field}", "/makes/{make}/models", "/fleet"];

/** The menu: groups of [anchor id, label]. */
const NAV: DocNavGroup[] = [
  { group: "Getting started", items: [["quick-start", "Quick start"], ["authentication", "Authentication"]] },
  { group: "Endpoints", items: ENDPOINTS.map((e) => [endpointId(e), <span style={{ ...code, fontSize: 12 }}>{e}</span>]) },
  { group: "Reference", items: [["filters", "Filters"], ["limits", "Limits and errors"]] },
  { group: "Plans", items: [["pricing", "Pricing"], ["custom", "Custom reports"]] },
];

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

  const p = { fontSize: 14, color: "#374151", lineHeight: 1.6, margin: "0 0 12px" } as const;

  return (
    <PageShell
      source="developers_page"
      subtitle="Developer API"
      crumb="Developers"
      title="NZ Vehicle Register API"
      intro="Every vehicle on the NZ Motor Vehicle Register as JSON. Search it, or count it any way you like. Refreshed automatically each month from NZTA."
      heroApi={{ to: "/account", title: "Get an API key", sub: "500 free requests a month" }}
    >
      <DocLayout label="API docs" groups={NAV} onNav={(id) => captureEvent("docs_nav_clicked", { section: id })}>
      <Section id="quick-start" title="Quick start">
        <Split
          left={
          <ol style={{ ...p, paddingLeft: 0, listStyle: "decimal inside", lineHeight: 2 }}>
            <li><Link to="/account" style={{ color: "#0369a1", fontWeight: 600 }}>Sign in</Link> with your email. No password, no card.</li>
            <li>Create a key on your account page.</li>
            <li>Send it as a Bearer token. That's it.</li>
          </ol>
          }
          right={<Pre title="Request">{`curl -G ${BASE}/vehicles \\
  -H "Authorization: Bearer nzvf_your_key" \\
  -d MAKE=TOYOTA \\
  -d MODEL=AQUA`}</Pre>}
        />
      </Section>

      <Section id="authentication" title="Authentication">
        <Split
          left={
            <>
              <p style={p}>
                Send your key in the <C>Authorization: Bearer</C> header (or <C>X-API-Key</C>). Keep it on your server: anyone with
                the key can spend your quota. Lost a key? Revoke it and make a new one on your <Link to="/account" style={{ color: "#0369a1" }}>account page</Link>.
              </p>
              <p style={{ ...p, margin: 0 }}>
                Every response is <C>{"{ data, source }"}</C>, where <C>source</C> holds the snapshot date
                and the NZTA credit line. The data is CC BY 4.0: if you publish it, credit NZTA.
              </p>
            </>
          }
          right={
            <>
              <Pre title="Base URL">{BASE}</Pre>
              <Pre title="Headers">{`Authorization: Bearer nzvf_your_key
# or
X-API-Key: nzvf_your_key`}</Pre>
            </>
          }
        />
      </Section>

      <Endpoint
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

      <Section id="filters" title="Filters">
        <Split
          left={
            <>
              <p style={p}>Every endpoint takes these as query parameters. Matching ignores case.</p>
              <Table
                head={["Write", "Matches"]}
                rows={[
                  [<C>MAKE=TOYOTA</C>, "Exactly TOYOTA"],
                  [<C>MAKE=TOYOTA,NISSAN</C>, <>Either one. Write a literal comma as <C>\,</C></>],
                  [<C>TRANSMISSION_TYPE=~MANUAL</C>, "Anything containing MANUAL"],
                  [<C>VEHICLE_YEAR_MIN=2015</C>, "2015 or newer (number fields only, also _MAX)"],
                ]}
              />
            </>
          }
          right={
            <Table
              head={["Kind", "Fields"]}
              rows={[
                ["Text", <span style={{ ...code, lineHeight: 1.8 }}>{TEXT_FIELDS.join(", ")}</span>],
                ["Number", <span style={{ ...code, lineHeight: 1.8 }}>{NUMBER_FIELDS.join(", ")}</span>],
              ]}
            />
          }
        />
      </Section>

      <Section id="limits" title="Limits and errors">
        <Split
          left={
            <p style={p}>
              Each call uses one request from your monthly quota, which resets on the 1st (UTC). One key can make
              up to {BURST_PER_SECOND} calls a second. Every response has <C>X-RateLimit-Remaining</C> and <C>X-RateLimit-Reset</C> headers.
            </p>
          }
          right={
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
          }
        />
      </Section>

      <Section id="pricing" title="Pricing">
        <div className="doc-pricing">
          {TIER_ORDER.map((id) => TIERS[id]).map((t) => (
            <Link
              key={t.id}
              to={t.priceNzd === 0 ? "/account" : `/account?plan=${t.id}`}
              className="doc-plan"
              onClick={() => captureEvent("plan_selected", { plan: t.id, source: "docs_pricing" })}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: "#6b7280" }}>{t.name}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", margin: "4px 0" }}>
                {t.priceNzd === 0 ? "Free" : `NZ$${t.priceNzd}`}
                {t.priceNzd > 0 && <span style={{ fontSize: 13, fontWeight: 500, color: "#6b7280" }}> / month</span>}
              </div>
              <div style={{ fontSize: 13, color: "#374151" }}>{t.monthlyRequests.toLocaleString("en-NZ")} requests a month</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0369a1", marginTop: 12 }}>
                {t.priceNzd === 0 ? "Start free" : `Choose ${t.name}`} <span aria-hidden>→</span>
              </div>
            </Link>
          ))}
          <a href="#custom" className="doc-plan" style={{ borderColor: "#bae6fd", background: "#f0f9ff" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#0369a1" }}>Custom</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", margin: "4px 0" }}>Quote</div>
            <div style={{ fontSize: 13, color: "#374151" }}>Bulk extracts and one-off breakdowns</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0369a1", marginTop: 12 }}>See options <span aria-hidden>↓</span></div>
          </a>
        </div>
        <p style={{ ...p, margin: "14px 0 0" }}>
Pick a plan and you go straight from sign-in to checkout. Card payments by Stripe, change or cancel whenever.
        </p>
      </Section>

      <Section id="custom" title="Custom reports and data">
        <p style={p}>
          Don't want to write code? Tell us what you need and we'll pull it for you, as a PDF report, a spreadsheet or both.
          Faster than a data request to NZTA, and you only pay for what you ask for.
        </p>
        <div className="doc-offers" style={{ marginBottom: 16 }}>
          {OFFERS.map((o) => (
            <div key={o.title} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "16px 18px", background: "#ffffff" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>{o.title}</div>
              <div style={{ fontSize: 12, color: "#0369a1", margin: "2px 0 8px" }}>{o.example}</div>
              <ul style={{ margin: 0, paddingLeft: 18, listStyle: "disc", fontSize: 13, color: "#374151", lineHeight: 1.6 }}>
                {o.includes.map((i) => <li key={i}>{i}</li>)}
              </ul>
            </div>
          ))}
        </div>
        <a href={CONTACT} style={{ display: "inline-block", background: "#0ea5e9", color: "#ffffff", fontWeight: 700, fontSize: 14, padding: "10px 18px", borderRadius: 8, textDecoration: "none" }}>
          Ask for a quote
        </a>
      </Section>
      </DocLayout>
    </PageShell>
  );
}
