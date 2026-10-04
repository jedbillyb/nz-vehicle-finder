// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { AccountStore } from "../../server/accounts";
import { MAX_SAVED_SEARCHES, canonicalQuery, describeSearch } from "../../shared/savedSearch";

describe("canonicalQuery", () => {
  it("sorts keys and drops empties and view settings", () => {
    expect(canonicalQuery("?MODEL=COROLLA&limit=100&MAKE=TOYOTA&TLA=&page=3")).toBe("MAKE=TOYOTA&MODEL=COROLLA");
  });

  it("gives the same string whatever order the filters were set in", () => {
    expect(canonicalQuery({ MAKE: "TOYOTA", BASIC_COLOUR: "WHITE,RED" }))
      .toBe(canonicalQuery("BASIC_COLOUR=WHITE%2CRED&MAKE=TOYOTA"));
  });

  it("is empty when no filter is set", () => {
    expect(canonicalQuery("?limit=50")).toBe("");
  });
});

describe("describeSearch", () => {
  it("reads like a sentence", () => {
    expect(describeSearch("MAKE=TOYOTA&MODEL=COROLLA&BASIC_COLOUR=WHITE,RED&MOTIVE_POWER=PETROL&VEHICLE_YEAR_MIN=2010&VEHICLE_YEAR_MAX=2020"))
      .toBe("Toyota Corolla · White or Red · Petrol · 2010-2020");
  });

  it("marks wildcard terms and names advanced fields", () => {
    expect(describeSearch("MODEL=~hilux&ORIGINAL_COUNTRY=JAPAN")).toBe('has "hilux" · Original Country: Japan');
  });

  it("falls back for an empty search", () => {
    expect(describeSearch("")).toBe("All vehicles");
  });
});

describe("saved searches in the account store", () => {
  let store: AccountStore;
  let userId: number;

  beforeEach(() => {
    store = new AccountStore(":memory:");
    const token = store.createLoginToken("saver@example.co.nz");
    userId = store.redeemLoginToken(token)!.user.id;
  });

  it("saves with a default name and lists newest first", () => {
    const a = store.saveSearch(userId, "MAKE=FORD", null);
    const b = store.saveSearch(userId, "MAKE=TOYOTA", "My Toyotas");
    expect(a).toMatchObject({ name: "Ford", query: "MAKE=FORD" });
    expect(store.listSearches(userId).map((s) => s.name)).toEqual(["My Toyotas", "Ford"]);
    expect(b).not.toBe("full");
  });

  it("returns the existing entry when the same filters are saved again", () => {
    const first = store.saveSearch(userId, "MAKE=TOYOTA&MODEL=COROLLA", null);
    const again = store.saveSearch(userId, "?MODEL=COROLLA&MAKE=TOYOTA&limit=100", "other");
    expect(again).toEqual(first);
    expect(store.listSearches(userId)).toHaveLength(1);
  });

  it("refuses an empty search and stops at the limit", () => {
    expect(store.saveSearch(userId, "limit=50", null)).toBe("empty");
    for (let i = 0; i < MAX_SAVED_SEARCHES; i++) store.saveSearch(userId, `VEHICLE_YEAR_MIN=${1950 + i}`, null);
    expect(store.saveSearch(userId, "MAKE=FORD", null)).toBe("full");
  });

  it("only lets the owner rename or delete", () => {
    const saved = store.saveSearch(userId, "MAKE=FORD", null);
    if (typeof saved === "string") throw new Error("not saved");
    const otherToken = store.createLoginToken("other@example.co.nz");
    const other = store.redeemLoginToken(otherToken)!.user.id;
    expect(store.renameSearch(other, saved.id, "mine now")).toBe(false);
    expect(store.deleteSearch(other, saved.id)).toBe(false);
    expect(store.listSearches(other)).toEqual([]);
    expect(store.renameSearch(userId, saved.id, "Fords")).toBe(true);
    expect(store.deleteSearch(userId, saved.id)).toBe(true);
    expect(store.listSearches(userId)).toEqual([]);
  });
});
