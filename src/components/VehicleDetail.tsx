import { Vehicle } from "@/lib/mockData";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VehicleDetailProps {
  vehicle: Vehicle;
  onClose: () => void;
}

const fieldLabels: Record<string, string> = {
  MAKE: "Make",
  MODEL: "Model",
  SUBMODEL: "Submodel",
  VEHICLE_YEAR: "Year",
  BASIC_COLOUR: "Colour",
  BODY_TYPE: "Body Type",
  MOTIVE_POWER: "Fuel Type",
  ALTERNATIVE_MOTIVE_POWER: "Alt. Motive Power",
  TRANSMISSION_TYPE: "Transmission",
  CC_RATING: "CC Rating",
  POWER_RATING: "Power (kW)",
  NUMBER_OF_SEATS: "Seats",
  NUMBER_OF_AXLES: "Axles",
  GROSS_VEHICLE_MASS: "Gross Mass (kg)",
  VDAM_WEIGHT: "VDAM Weight (kg)",
  WIDTH: "Width (mm)",
  HEIGHT: "Height (mm)",
  VIN11: "VIN (first 11)",
  CHASSIS7: "Chassis (first 7)",
  ENGINE_NUMBER: "Engine Number",
  CLASS: "Vehicle Class",
  VEHICLE_TYPE: "Vehicle Type",
  VEHICLE_USAGE: "Usage",
  INDUSTRY_CLASS: "Industry Class",
  INDUSTRY_MODEL_CODE: "Industry Model Code",
  MVMA_MODEL_CODE: "MVMA Model Code",
  ROAD_TRANSPORT_CODE: "Road Transport Code",
  TLA: "Region (TLA)",
  POSTCODE: "Postcode",
  ORIGINAL_COUNTRY: "Country of Manufacture",
  PREVIOUS_COUNTRY: "Previous Country",
  IMPORT_STATUS: "Import Status",
  NZ_ASSEMBLED: "NZ Assembled",
  FIRST_NZ_REGISTRATION_YEAR: "First NZ Rego Year",
  FIRST_NZ_REGISTRATION_MONTH: "First NZ Rego Month",
  FC_COMBINED: "Fuel (Combined L/100km)",
  FC_URBAN: "Fuel (Urban L/100km)",
  FC_EXTRA_URBAN: "Fuel (Extra Urban L/100km)",
  SYNTHETIC_GREENHOUSE_GAS: "Greenhouse Gas",
};

export function VehicleDetail({ vehicle, onClose }: VehicleDetailProps) {
  const entries = Object.entries(fieldLabels);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-4 border-b border-border mb-4">
          <div>
            <h2 className="text-lg font-bold text-foreground font-mono">
              {vehicle.VEHICLE_YEAR} {vehicle.MAKE} {vehicle.MODEL}
            </h2>
            <p className="text-xs text-muted-foreground font-mono">VIN: {vehicle.VIN11}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="overflow-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {entries.map(([key, label]) => {
              const val = vehicle[key as keyof Vehicle];
              if (!val) return null;
              return (
                <div key={key} className="flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{label}</span>
                  <span className="text-sm font-mono text-foreground">{val}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
