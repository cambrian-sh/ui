import { describe, expect, it } from "vitest";
import {
  celRef,
  directlyReadable,
  exampleValueAt,
  fanOutBase,
  lineageOf,
  lineageSummary,
  parseFieldSchema,
  pickerFields,
} from "./fieldSchema";
import type { FieldSchema } from "@/ipc/types";

describe("the field schema reads", () => {
  it("parses the wire form and treats emptiness as unchecked, not as no fields", () => {
    expect(parseFieldSchema("")).toBeNull();
    expect(parseFieldSchema(undefined)).toBeNull();
    expect(parseFieldSchema("not json")).toBeNull();
    const parsed = parseFieldSchema(
      JSON.stringify({ c: { available: [{ path: "magnitude", types: ["number"] }] } }),
    );
    expect(parsed?.c.available?.[0].path).toBe("magnitude");
  });

  it("knows a member path cannot be read directly, and names its fan-out", () => {
    expect(directlyReadable("magnitude")).toBe(true);
    expect(directlyReadable("properties.mag")).toBe(true);
    expect(directlyReadable("features.*.properties.mag")).toBe(false);
    expect(fanOutBase("features.*.properties.mag")).toBe("features");
    expect(fanOutBase("magnitude")).toBeNull();
  });

  it("spells a CEL reference the way the kernel's own generator does", () => {
    expect(celRef("magnitude")).toBe("item.magnitude");
    expect(celRef("properties.mag")).toBe("item.properties.mag");
    // Numeric segments index rather than select — `item.rows[0].id`.
    expect(celRef("rows.0.id")).toBe("item.rows[0].id");
  });

  it("sorts directly readable fields ahead of member fields in the picker", () => {
    const sorted = pickerFields({
      available: [
        { path: "features.*.properties.mag" },
        { path: "magnitude" },
        { path: "place" },
      ],
    });
    expect(sorted.map((f) => f.path)).toEqual([
      "magnitude",
      "place",
      "features.*.properties.mag",
    ]);
  });
});

describe("field lineage", () => {
  const schema: FieldSchema = {
    trigger: { available: [{ path: "magnitude" }, { path: "place" }] },
    gate: { reads: ["magnitude", "place"] },
    shape: { writes: ["mag_band"], reads: ["magnitude"] },
    dropper: { drops: ["place"] },
    save: { reads: [] },
  };
  const gates = new Set(["gate"]);

  it("joins reads, writes and drops into per-node roles", () => {
    const l = lineageOf(schema, "magnitude", gates);
    expect(l.get("gate")).toBe("routes on");
    expect(l.get("shape")).toBe("reads");
    expect(l.has("save")).toBe(false);

    const w = lineageOf(schema, "mag_band", gates);
    expect(w.get("shape")).toBe("writes");
  });

  it("is prefix-aware in both directions — dropping a parent drops the subtree", () => {
    const l = lineageOf(schema, "place.name", gates);
    expect(l.get("dropper")).toBe("drops");
    // And reading a child is reading under the parent.
    const r = lineageOf({ n: { reads: ["properties.mag"] } }, "properties", new Set());
    expect(r.get("n")).toBe("reads");
  });

  it("says that nothing touches a field, as itself", () => {
    expect(lineageSummary(new Map())).toBe("nothing in this graph touches it");
    expect(
      lineageSummary(
        new Map([
          ["gate", "routes on"],
          ["a", "reads"],
          ["b", "reads"],
          ["dropper", "drops"],
        ]),
      ),
    ).toBe("1 routes on it · 2 read it · 1 drops it");
  });
});

describe("example values", () => {
  const quake = {
    id: "us6000tics",
    properties: { mag: 5.3, place: "62 km W of Tobelo, Indonesia" },
    features: [{ properties: { mag: 4.1 } }, { properties: { mag: 2.2 } }],
  };

  it("reads the value a field held in a real item, member paths via the first member", () => {
    expect(exampleValueAt(quake, "properties.mag")).toBe("5.3");
    expect(exampleValueAt(quake, "features.*.properties.mag")).toBe("4.1");
    expect(exampleValueAt(quake, "id")).toBe('"us6000tics"');
  });

  it("says nothing for an absent path, rather than claiming a value", () => {
    expect(exampleValueAt(quake, "nope.deeper")).toBeNull();
    expect(exampleValueAt(quake, "properties.nope")).toBeNull();
  });

  it("summarises containers instead of dumping them into a chip", () => {
    expect(exampleValueAt(quake, "features")).toBe("[2 items]");
    expect(exampleValueAt(quake, "properties")).toBe("{…}");
  });
});
