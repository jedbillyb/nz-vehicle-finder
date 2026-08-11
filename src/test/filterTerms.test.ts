import { describe, it, expect } from "vitest";
import {
  parseFilterValue,
  serializeTerms,
  hasTerms,
  firstExactValue,
} from "../../shared/filterTerms";

describe("parseFilterValue", () => {
  it("reads a plain single value as one exact term, so old shared links still work", () => {
    expect(parseFilterValue("TOYOTA")).toEqual([{ value: "TOYOTA", contains: false }]);
    expect(parseFilterValue("AUCKLAND CITY")).toEqual([{ value: "AUCKLAND CITY", contains: false }]);
  });

  it("splits several values on commas", () => {
    expect(parseFilterValue("RED,BLUE")).toEqual([
      { value: "RED", contains: false },
      { value: "BLUE", contains: false },
    ]);
  });

  it("reads a leading tilde as a contains term", () => {
    expect(parseFilterValue("~Manual")).toEqual([{ value: "Manual", contains: true }]);
  });

  it("mixes contains and exact terms in one field", () => {
    expect(parseFilterValue("~Manual,Automatic 4")).toEqual([
      { value: "Manual", contains: true },
      { value: "Automatic 4", contains: false },
    ]);
  });

  it("keeps escaped commas and tildes inside a value", () => {
    expect(parseFilterValue("ALEXANDER\\, DENNIS")).toEqual([
      { value: "ALEXANDER, DENNIS", contains: false },
    ]);
    expect(parseFilterValue("\\~ODD")).toEqual([{ value: "~ODD", contains: false }]);
  });

  it("drops blanks and duplicates", () => {
    expect(parseFilterValue("RED,,RED,red")).toEqual([{ value: "RED", contains: false }]);
    expect(parseFilterValue("")).toEqual([]);
    expect(parseFilterValue(undefined)).toEqual([]);
  });

  it("treats an exact and a contains term of the same text as different", () => {
    expect(parseFilterValue("Manual,~Manual")).toHaveLength(2);
  });
});

describe("serializeTerms", () => {
  it("round-trips every shape through parse", () => {
    const cases = [
      [{ value: "TOYOTA", contains: false }],
      [{ value: "RED", contains: false }, { value: "BLUE", contains: false }],
      [{ value: "Manual", contains: true }, { value: "Automatic 4", contains: false }],
      [{ value: "ALEXANDER, DENNIS", contains: false }],
      [{ value: "~ODD", contains: false }],
      [{ value: "VE|| SV6", contains: false }],
      [{ value: "BACK\\SLASH", contains: false }],
    ];
    for (const terms of cases) {
      expect(parseFilterValue(serializeTerms(terms))).toEqual(terms);
    }
  });

  it("emits a bare value for a single exact term", () => {
    expect(serializeTerms([{ value: "TOYOTA", contains: false }])).toBe("TOYOTA");
  });

  it("skips empty values", () => {
    expect(serializeTerms([{ value: "  ", contains: false }])).toBe("");
  });
});

describe("helpers", () => {
  it("hasTerms reflects whether anything is set", () => {
    expect(hasTerms("TOYOTA")).toBe(true);
    expect(hasTerms("")).toBe(false);
    expect(hasTerms(",,")).toBe(false);
  });

  it("firstExactValue prefers an exact term over a contains one", () => {
    expect(firstExactValue("~Manual,Automatic 4")).toBe("Automatic 4");
    expect(firstExactValue("~Manual")).toBe("Manual");
    expect(firstExactValue("")).toBe("");
  });
});
