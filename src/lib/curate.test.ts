import { describe, it, expect } from "vitest";
import { curateTags } from "@/lib/curate";

describe("curateTags", () => {
  it("removes blacklisted tags case-insensitively", () => {
    expect(curateTags(["Watermark", "1girl"], ["watermark"])).toEqual([
      "1girl",
    ]);
  });

  it("treats underscores and spaces as equivalent", () => {
    // Blacklist written with underscore, stored tag with a space.
    expect(curateTags(["blue hair", "smile"], ["blue_hair"])).toEqual([
      "smile",
    ]);
    // …and the reverse: blacklist with a space, stored with underscore.
    expect(curateTags(["blue_hair", "smile"], ["blue hair"])).toEqual([
      "smile",
    ]);
  });

  it("preserves the original order of surviving tags", () => {
    expect(
      curateTags(["1girl", "watermark", "solo", "signature"], [
        "watermark",
        "signature",
      ]),
    ).toEqual(["1girl", "solo"]);
  });

  it("is a no-op when no tag matches", () => {
    const tags = ["1girl", "solo"];
    expect(curateTags(tags, ["watermark"])).toEqual(tags);
  });

  it("preserves kaomoji underscores (not treated as separators)", () => {
    expect(curateTags(["^_^", "1girl"], ["watermark"])).toEqual([
      "^_^",
      "1girl",
    ]);
  });

  it("returns the list unchanged for an empty or blank blacklist", () => {
    const tags = ["1girl", "solo"];
    expect(curateTags(tags, [])).toEqual(tags);
    expect(curateTags(tags, ["", "   "])).toEqual(tags);
  });
});
