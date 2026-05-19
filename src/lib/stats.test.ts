import { describe, it, expect } from "vitest";
import {
  countByStatus,
  countByCostume,
  tagFrequency,
  imbalanceWarnings,
} from "@/lib/stats";
import type { Costume, ImageItem } from "@/lib/types";

function img(over: Partial<ImageItem>): ImageItem {
  return {
    id: "i",
    projectId: "p",
    costumeId: null,
    filename: "f.png",
    filepath: "/f.png",
    sourcePath: null,
    width: 1,
    height: 1,
    tagsAuto: [],
    tagsFinal: [],
    caption: null,
    costumeScore: {},
    status: "pending",
    createdAt: 0,
    ...over,
  };
}

function costume(over: Partial<Costume>): Costume {
  return {
    id: "c",
    projectId: "p",
    name: "C",
    trigger: null,
    tags: [],
    colorTags: [],
    sortOrder: 0,
    ...over,
  };
}

describe("countByStatus", () => {
  it("tallies each status", () => {
    const r = countByStatus([
      img({ status: "pending" }),
      img({ status: "validated" }),
      img({ status: "validated" }),
    ]);
    expect(r).toEqual({
      pending: 1,
      tagged: 0,
      validated: 2,
      exported: 0,
    });
  });
});

describe("countByCostume", () => {
  it("buckets unknown / missing costume ids as 'none'", () => {
    const costumes = [
      costume({ id: "a", name: "A" }),
      costume({ id: "b", name: "B" }),
    ];
    const out = countByCostume(
      [
        img({ costumeId: "a" }),
        img({ costumeId: "a" }),
        img({ costumeId: "zzz" }),
        img({ costumeId: null }),
      ],
      costumes,
    );
    const byId = new Map(out.map((c) => [c.id, c.count]));
    expect(byId.get("a")).toBe(2);
    expect(byId.get("b")).toBe(0);
    expect(byId.get(null)).toBe(2);
  });
});

describe("tagFrequency", () => {
  it("counts case-insensitively, once per image, with pct", () => {
    const out = tagFrequency([
      img({ tagsFinal: ["Cat", "cat", "dog"] }),
      img({ tagsFinal: ["cat"] }),
    ]);
    expect(out).toEqual([
      { tag: "Cat", count: 2, pct: 100 },
      { tag: "dog", count: 1, pct: 50 },
    ]);
  });
});

describe("imbalanceWarnings", () => {
  it("flags under-filled costumes, unassigned and untagged images", () => {
    const warnings = imbalanceWarnings(
      [
        img({ costumeId: "a", tagsFinal: ["x"] }),
        img({ costumeId: null, tagsFinal: [] }),
      ],
      [costume({ id: "a", name: "A" })],
      true,
    );
    expect(warnings.some((w) => w.includes("Costume “A”"))).toBe(true);
    expect(
      warnings.some((w) => w.includes("no costume assigned")),
    ).toBe(true);
    expect(warnings.some((w) => w.includes("no final tags"))).toBe(true);
  });

  it("flags an over-represented tag", () => {
    const warnings = imbalanceWarnings(
      [
        img({ tagsFinal: ["solo"] }),
        img({ tagsFinal: ["solo"] }),
        img({ tagsFinal: ["solo", "x"] }),
      ],
      [],
      false,
    );
    expect(
      warnings.some(
        (w) => w.includes("“solo”") && w.includes("constant tag"),
      ),
    ).toBe(true);
  });
});
