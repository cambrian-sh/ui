import { describe, expect, it } from "vitest";
import { celToRows, rowsToCEL } from "./conditionRows";

describe("rows to CEL", () => {
  it("says the earthquake filter in three clicks' worth of rows", () => {
    expect(
      rowsToCEL(
        [
          { path: "properties.mag", op: "gt", value: "5" },
          { path: "properties.place", op: "contains", value: "Turkey" },
        ],
        "all",
      ),
    ).toBe('item.properties.mag > 5.0 && item.properties.place.contains("Turkey")');
  });

  it("writes whole numbers with a decimal point, because the type checker cares", () => {
    // `item.mag > 5` fails CEL's check where `> 5.0` passes; typing "5" must
    // not require knowing that.
    expect(rowsToCEL([{ path: "mag", op: "gt", value: "5" }], "all")).toBe(
      "item.mag > 5.0",
    );
  });

  it("quotes text, keeps numbers, and renders existence as has()", () => {
    expect(rowsToCEL([{ path: "status", op: "eq", value: "active" }], "all")).toBe(
      'item.status == "active"',
    );
    expect(rowsToCEL([{ path: "tsunami", op: "exists", value: "" }], "all")).toBe(
      "has(item.tsunami)",
    );
    expect(rowsToCEL([{ path: "tsunami", op: "missing", value: "" }], "all")).toBe(
      "!has(item.tsunami)",
    );
  });

  it("any-of joins with ||, and half-finished rows contribute nothing", () => {
    expect(
      rowsToCEL(
        [
          { path: "mag", op: "gt", value: "5" },
          { path: "", op: "gt", value: "9" }, // no field chosen yet
          { path: "depth", op: "lt", value: "" }, // no value yet
          { path: "sig", op: "gte", value: "600" },
        ],
        "any",
      ),
    ).toBe("item.mag > 5.0 || item.sig >= 600.0");
  });
});

describe("CEL back to rows", () => {
  it("round-trips everything the builder writes", () => {
    const cel = 'item.properties.mag > 5.0 && item.properties.place.contains("Turkey")';
    const back = celToRows(cel);
    expect(back).not.toBeNull();
    expect(back!.combine).toBe("all");
    expect(back!.rows).toEqual([
      { path: "properties.mag", op: "gt", value: "5.0" },
      { path: "properties.place", op: "contains", value: "Turkey" },
    ]);
    expect(rowsToCEL(back!.rows, back!.combine)).toBe(cel);
  });

  it("steps aside for anything it did not write, rather than approximating", () => {
    expect(celToRows("(item.a > 1.0 || item.b > 2.0) && item.c > 3.0")).toBeNull();
    expect(celToRows("item.a > 1.0 && item.b > 2.0 || item.c > 3.0")).toBeNull();
    expect(celToRows("item.mag * 10.0 > 50.0")).toBeNull();
    expect(celToRows("size(item.items) > 3")).toBeNull();
    expect(celToRows('signal.ingress_id == "usgs"')).toBeNull();
  });

  it("an empty condition is an empty builder, not a refusal to build", () => {
    expect(celToRows("")).toEqual({ rows: [], combine: "all" });
  });
});
