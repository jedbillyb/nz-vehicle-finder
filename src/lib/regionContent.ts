export type RegionBlurb = {
  blurb: string;
};

export const REGION_CONTENT: Record<string, RegionBlurb> = {
  AUCKLAND: {
    blurb:
      "Auckland is New Zealand's largest city and home to around a third of the country's population, making it by far the most vehicle-dense region on the register. The SuperCity spans the Auckland Isthmus and encompasses former cities like Manukau, Waitakere, and North Shore, which explains its outsized share of total registrations.",
  },
  "CHRISTCHURCH CITY": {
    blurb:
      "Christchurch is the South Island's largest city and the commercial hub of the Canterbury region. The city's flat terrain and expanding suburban boundaries make it highly car-dependent, and it consistently ranks second on the national vehicle register.",
  },
  "HAMILTON CITY": {
    blurb:
      "Hamilton sits in the heart of the Waikato region and serves as the main centre for the surrounding agricultural district. Its growing population and role as a regional hub keep vehicle registrations consistently high.",
  },
  "TAURANGA CITY": {
    blurb:
      "Tauranga is one of New Zealand's fastest-growing cities, driven by internal migration and a thriving port economy. Its relatively young population and sprawling suburban layout contribute to high per-capita vehicle ownership.",
  },
  "WELLINGTON CITY": {
    blurb:
      "Wellington is New Zealand's capital and a compact, hilly city with a well-used public transport network. Despite its size, vehicle registrations are somewhat lower per capita than other cities due to the terrain and commuter patterns.",
  },
  "DUNEDIN CITY": {
    blurb:
      "Dunedin is Otago's main centre and home to a large student population, which influences the mix of older and cheaper vehicles on the register. The city's hilly terrain and southern climate make reliable, affordable transport a priority for residents.",
  },
  "WHANGAREI DISTRICT": {
    blurb:
      "Whangarei is Northland's main urban centre, serving a large rural hinterland. Its position as the gateway to the Far North and a relatively dispersed population make private vehicles the dominant form of transport.",
  },
  "PALMERSTON NORTH CITY": {
    blurb:
      "Palmerston North is the main urban centre for the Manawatu-Whanganui region, with a significant student and agricultural services population. Its flat layout and limited public transport make it highly car-dependent.",
  },
  "WAIMAKARIRI DISTRICT": {
    blurb:
      "Waimakariri District lies north of Christchurch and has grown rapidly as a commuter region following the Canterbury earthquakes. High vehicle ownership reflects its predominantly suburban and rural character.",
  },
  "NEW PLYMOUTH DISTRICT": {
    blurb:
      "New Plymouth is the main centre of the Taranaki region, with an economy anchored in dairy farming, energy, and manufacturing. The surrounding rural district contributes significantly to total vehicle registrations.",
  },
  "LOWER HUTT CITY": {
    blurb:
      "Lower Hutt is part of the Wellington metropolitan area and sits in the Hutt Valley. It has a strong manufacturing and suburban residential character, with many residents commuting to Wellington.",
  },
  "HASTINGS DISTRICT": {
    blurb:
      "Hastings forms part of the Hawke's Bay twin cities alongside Napier, serving a large horticultural and viticulture region. The area's rural economy and dispersed population drive high vehicle ownership.",
  },
  "NAPIER CITY": {
    blurb:
      "Napier is an Art Deco coastal city in Hawke's Bay, best known for its port and wine industry. It forms an urban pair with Hastings and has a vehicle profile typical of provincial New Zealand cities.",
  },
  "ROTORUA DISTRICT": {
    blurb:
      "Rotorua is a major North Island tourist destination built around geothermal activity, with a significant Maori cultural presence. Its rural district and tourism economy both contribute to its vehicle count.",
  },
  "QUEENSTOWN-LAKES DISTRICT": {
    blurb:
      "Queenstown-Lakes is one of New Zealand's fastest-growing districts, driven by tourism and lifestyle migration. Despite its relatively small permanent population, the number of registered vehicles is high and skews toward newer, premium models.",
  },
};

export function getRegionBlurb(tlaUpper: string): RegionBlurb {
  return (
    REGION_CONTENT[tlaUpper] ?? {
      blurb: `${tlaUpper
        .split(" ")
        .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
        .join(" ")} vehicles are registered with the New Zealand Motor Vehicle Register. Browse the full list below to see registration counts, model breakdowns and fuel type distributions.`,
    }
  );
}
