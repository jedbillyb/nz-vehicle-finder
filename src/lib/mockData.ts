export interface Vehicle {
  ALTERNATIVE_MOTIVE_POWER: string;
  BASIC_COLOUR: string;
  BODY_TYPE: string;
  CC_RATING: string;
  CHASSIS7: string;
  CLASS: string;
  ENGINE_NUMBER: string;
  FIRST_NZ_REGISTRATION_YEAR: string;
  FIRST_NZ_REGISTRATION_MONTH: string;
  GROSS_VEHICLE_MASS: string;
  HEIGHT: string;
  IMPORT_STATUS: string;
  INDUSTRY_CLASS: string;
  INDUSTRY_MODEL_CODE: string;
  MAKE: string;
  MODEL: string;
  MOTIVE_POWER: string;
  MVMA_MODEL_CODE: string;
  NUMBER_OF_AXLES: string;
  NUMBER_OF_SEATS: string;
  NZ_ASSEMBLED: string;
  ORIGINAL_COUNTRY: string;
  POWER_RATING: string;
  PREVIOUS_COUNTRY: string;
  ROAD_TRANSPORT_CODE: string;
  SUBMODEL: string;
  TLA: string;
  POSTCODE: string;
  TRANSMISSION_TYPE: string;
  VDAM_WEIGHT: string;
  VEHICLE_TYPE: string;
  VEHICLE_USAGE: string;
  VEHICLE_YEAR: string;
  VIN11: string;
  WIDTH: string;
  SYNTHETIC_GREENHOUSE_GAS: string;
  FC_COMBINED: string;
  FC_URBAN: string;
  FC_EXTRA_URBAN: string;
}

const makes = ["TOYOTA", "HONDA", "NISSAN", "MAZDA", "FORD", "MITSUBISHI", "SUBARU", "SUZUKI", "BMW", "MERCEDES-BENZ", "HYUNDAI", "KIA", "VOLKSWAGEN", "TESLA", "BYD"];
const models: Record<string, string[]> = {
  TOYOTA: ["COROLLA", "CAMRY", "RAV4", "HILUX", "YARIS", "PRIUS", "LAND CRUISER", "AQUA"],
  HONDA: ["CIVIC", "FIT", "CR-V", "ACCORD", "HR-V", "JAZZ"],
  NISSAN: ["LEAF", "X-TRAIL", "NAVARA", "QASHQAI", "NOTE", "TIIDA"],
  MAZDA: ["CX-5", "MAZDA3", "MAZDA2", "CX-3", "BT-50", "CX-9"],
  FORD: ["RANGER", "FOCUS", "FIESTA", "ESCAPE", "TERRITORY", "EVEREST"],
  MITSUBISHI: ["OUTLANDER", "ASX", "TRITON", "ECLIPSE CROSS", "PAJERO"],
  SUBARU: ["OUTBACK", "FORESTER", "IMPREZA", "XV", "LEGACY", "WRX"],
  SUZUKI: ["SWIFT", "VITARA", "JIMNY", "S-CROSS", "BALENO"],
  BMW: ["3 SERIES", "X3", "X5", "1 SERIES", "5 SERIES"],
  "MERCEDES-BENZ": ["C-CLASS", "A-CLASS", "GLC", "E-CLASS"],
  HYUNDAI: ["TUCSON", "KONA", "i30", "SANTA FE", "IONIQ 5"],
  KIA: ["SPORTAGE", "SELTOS", "CERATO", "SORENTO", "EV6"],
  VOLKSWAGEN: ["GOLF", "TIGUAN", "POLO", "T-CROSS", "ID.4"],
  TESLA: ["MODEL 3", "MODEL Y", "MODEL S", "MODEL X"],
  BYD: ["ATTO 3", "DOLPHIN", "SEAL"],
};
const colours = ["WHITE", "SILVER", "BLACK", "GREY", "BLUE", "RED", "GREEN", "BROWN", "YELLOW", "ORANGE", "CREAM"];
const bodyTypes = ["SEDAN", "HATCHBACK", "SUV", "STATION WAGON", "UTE", "VAN", "COUPE", "CONVERTIBLE"];
const tlas = ["AUCKLAND", "WELLINGTON", "CHRISTCHURCH", "HAMILTON", "TAURANGA", "DUNEDIN", "PALMERSTON NORTH", "NAPIER", "NELSON", "QUEENSTOWN"];
const fuels = ["PETROL", "DIESEL", "ELECTRIC", "PETROL/ELECTRIC", "DIESEL/ELECTRIC"];
const transmissions = ["AUTOMATIC", "MANUAL", "CVT"];
const countries = ["JAPAN", "THAILAND", "GERMANY", "USA", "KOREA", "CHINA", "UK", "AUSTRALIA"];
const importStatuses = ["USED", "NEW", "NZ NEW"];
const usages = ["PRIVATE", "TRADE", "RENTAL", "EXEMPT"];

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateVehicle(i: number): Vehicle {
  const make = randomFrom(makes);
  const modelList = models[make] || ["UNKNOWN"];
  const model = randomFrom(modelList);
  const fuel = make === "TESLA" || make === "BYD" ? "ELECTRIC" : randomFrom(fuels);
  const year = String(2000 + Math.floor(Math.random() * 26));
  const cc = fuel === "ELECTRIC" ? "" : String(1000 + Math.floor(Math.random() * 3000));
  const power = fuel === "ELECTRIC" ? String(100 + Math.floor(Math.random() * 300)) : String(50 + Math.floor(Math.random() * 200));

  return {
    ALTERNATIVE_MOTIVE_POWER: fuel.includes("ELECTRIC") ? "ELECTRIC" : "",
    BASIC_COLOUR: randomFrom(colours),
    BODY_TYPE: randomFrom(bodyTypes),
    CC_RATING: cc,
    CHASSIS7: `${make.slice(0, 2)}${String(i).padStart(5, "0")}`,
    CLASS: "MA",
    ENGINE_NUMBER: `ENG${String(i).padStart(7, "0")}`,
    FIRST_NZ_REGISTRATION_YEAR: year,
    FIRST_NZ_REGISTRATION_MONTH: String(1 + Math.floor(Math.random() * 12)),
    GROSS_VEHICLE_MASS: String(1200 + Math.floor(Math.random() * 1800)),
    HEIGHT: String(1400 + Math.floor(Math.random() * 600)),
    IMPORT_STATUS: randomFrom(importStatuses),
    INDUSTRY_CLASS: "MC",
    INDUSTRY_MODEL_CODE: `${make.slice(0, 3)}${model.slice(0, 3)}`,
    MAKE: make,
    MODEL: model,
    MOTIVE_POWER: fuel,
    MVMA_MODEL_CODE: `${make.slice(0, 2)}${model.slice(0, 2)}`,
    NUMBER_OF_AXLES: "2",
    NUMBER_OF_SEATS: String(2 + Math.floor(Math.random() * 6)),
    NZ_ASSEMBLED: Math.random() > 0.95 ? "YES" : "NO",
    ORIGINAL_COUNTRY: randomFrom(countries),
    POWER_RATING: power,
    PREVIOUS_COUNTRY: randomFrom(countries),
    ROAD_TRANSPORT_CODE: "10",
    SUBMODEL: "",
    TLA: randomFrom(tlas),
    POSTCODE: String(1000 + Math.floor(Math.random() * 9000)),
    TRANSMISSION_TYPE: make === "TESLA" ? "AUTOMATIC" : randomFrom(transmissions),
    VDAM_WEIGHT: String(900 + Math.floor(Math.random() * 1500)),
    VEHICLE_TYPE: "PASSENGER CAR/VAN",
    VEHICLE_USAGE: randomFrom(usages),
    VEHICLE_YEAR: year,
    VIN11: `${make.slice(0, 3)}${year.slice(2)}${String(i).padStart(6, "0")}`,
    WIDTH: String(1600 + Math.floor(Math.random() * 400)),
    SYNTHETIC_GREENHOUSE_GAS: "",
    FC_COMBINED: fuel === "ELECTRIC" ? "" : (5 + Math.random() * 8).toFixed(1),
    FC_URBAN: fuel === "ELECTRIC" ? "" : (6 + Math.random() * 10).toFixed(1),
    FC_EXTRA_URBAN: fuel === "ELECTRIC" ? "" : (4 + Math.random() * 6).toFixed(1),
  };
}

// Generate 200 sample vehicles
export const mockVehicles: Vehicle[] = Array.from({ length: 200 }, (_, i) => generateVehicle(i));

// Extract unique values for autocomplete suggestions
export function getDistinctValues(field: keyof Vehicle): string[] {
  const values = new Set(mockVehicles.map((v) => v[field]).filter(Boolean));
  return Array.from(values).sort();
}
