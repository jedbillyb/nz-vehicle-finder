import { describe, expect, it } from "vitest";
import { titleCaseMake } from "@/lib/slugs";

describe("titleCaseMake", () => {
  it.each([
    ["TOYOTA", "Toyota"],
    ["BMW", "BMW"],
    ["MERCEDES-BENZ", "Mercedes-Benz"],
    ["LAND ROVER", "Land Rover"],
    ["MG", "MG"],
    ["GMC", "GMC"],
    ["KIA", "Kia"],
    ["ROLLS-ROYCE", "Rolls-Royce"],
  ])("%s -> %s", (input, out) => expect(titleCaseMake(input)).toBe(out));
});
