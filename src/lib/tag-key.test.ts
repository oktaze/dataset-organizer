import { describe, it, expect } from "vitest";
import { ciKey, dedupeNames } from "@/lib/tag-key";

describe("ciKey", () => {
  it("trims and lowercases", () => {
    expect(ciKey("  Blue Hair ")).toBe("blue hair");
    expect(ciKey("TAG")).toBe("tag");
  });
});

describe("dedupeNames", () => {
  it("keeps the first occurrence, case-insensitively", () => {
    expect(dedupeNames(["Tag", "tag", "other", " Tag "])).toEqual([
      "Tag",
      "other",
    ]);
  });

  it("drops empty / whitespace entries", () => {
    expect(dedupeNames(["", "  ", "x"])).toEqual(["x"]);
  });
});
