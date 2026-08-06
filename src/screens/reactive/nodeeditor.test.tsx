import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NodeEditor } from "./NodeEditor";
import { editorFields, editorValue } from "./nodeEditors";
import { NODE_SPECS } from "./nodeVocabulary";
import type { GraphNode, NodeFields } from "@/ipc/types";

afterEach(cleanup);

const quakeFields: NodeFields = {
  available: [
    { path: "magnitude", types: ["number"] },
    { path: "place", types: ["string"] },
    { path: "features.*.properties.mag", types: ["number"] },
  ],
};

function choiceNode(condition = ""): GraphNode {
  return { id: "c1", kind: "choice", name: "", config: { condition } };
}

describe("the editor registry", () => {
  it("covers every kind in the palette except the ones with nothing to author", () => {
    // A trigger is bound by the studio; a merge's whole configuration is its
    // wiring; an apply_mapping's config is the transform's pinned IDENTITY,
    // which changes through the studio lifecycle and must never be a form.
    const unconfigured = new Set(["trigger", "merge", "apply_mapping"]);
    for (const spec of NODE_SPECS) {
      if (unconfigured.has(spec.kind)) continue;
      expect(
        editorFields(spec.kind).length,
        `kind ${spec.kind} has no editable surface`,
      ).toBeGreaterThan(0);
    }
  });

  it("never offers the save's mapping identity as a form field", () => {
    const keys = editorFields("save_to_memory").map((f) => f.key);
    expect(keys).not.toContain("ingress_id");
    expect(keys).not.toContain("mapping_revision");
  });

  it("reads config values in the shape each input expects", () => {
    const node: GraphNode = {
      id: "m",
      kind: "map",
      config: { set: { a: "1" }, drop: ["b"] },
    };
    const [set, drop] = editorFields("map");
    expect(editorValue(node, set)).toEqual({ a: "1" });
    expect(editorValue(node, drop)).toEqual(["b"]);
    // Absent config degrades to the empty shape, never to undefined.
    const bare: GraphNode = { id: "m2", kind: "map" };
    expect(editorValue(bare, set)).toEqual({});
    expect(editorValue(bare, drop)).toEqual([]);
  });
});

describe("editing a choice", () => {
  it("types a condition into the draft, behind the advanced toggle", () => {
    const onConfig = vi.fn();
    render(
      <NodeEditor
        node={choiceNode()}
        fields={quakeFields}
        fieldsUnchecked={false}
        onConfig={onConfig}
        onRename={() => {}}
      />,
    );
    // The rows are the default; the expression is one toggle away.
    fireEvent.click(screen.getByText("edit as an expression"));
    fireEvent.change(screen.getByLabelText("condition"), {
      target: { value: "item.magnitude > 5.0" },
    });
    expect(onConfig).toHaveBeenCalledWith("condition", "item.magnitude > 5.0");
  });

  it("clicking a field chip types its CEL reference into an open expression", () => {
    const onConfig = vi.fn();
    render(
      <NodeEditor
        node={choiceNode()}
        fields={quakeFields}
        fieldsUnchecked={false}
        onConfig={onConfig}
        onRename={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("edit as an expression"));
    fireEvent.click(screen.getByText("magnitude"));
    expect(onConfig).toHaveBeenCalledWith("condition", "item.magnitude");
  });

  it("with the rows open, a chip click follows the field instead of doing nothing", () => {
    const onFollow = vi.fn();
    render(
      <NodeEditor
        node={choiceNode()}
        fields={quakeFields}
        fieldsUnchecked={false}
        onConfig={() => {}}
        onRename={() => {}}
        onFollowField={onFollow}
      />,
    );
    fireEvent.click(screen.getByText("magnitude"));
    expect(onFollow).toHaveBeenCalledWith("magnitude");
  });

  it("a member field explains its fan-out instead of inserting what cannot compile", () => {
    const onConfig = vi.fn();
    const onFollow = vi.fn();
    render(
      <NodeEditor
        node={choiceNode()}
        fields={quakeFields}
        fieldsUnchecked={false}
        onConfig={onConfig}
        onRename={() => {}}
        onFollowField={onFollow}
      />,
    );
    const chip = screen.getByText("features.*.properties.mag").closest("button")!;
    expect(chip.title).toContain("fan out over item.features");
    fireEvent.click(chip);
    expect(onConfig).not.toHaveBeenCalled();
    expect(onFollow).toHaveBeenCalledWith("features.*.properties.mag");
  });

  it("says unchecked when there is no projection, never no fields", () => {
    render(
      <NodeEditor
        node={choiceNode()}
        fields={undefined}
        fieldsUnchecked={true}
        onConfig={() => {}}
        onRename={() => {}}
      />,
    );
    // The copy must SAY it is not the "no fields" claim — that distinction is
    // the whole reason the unchecked state exists.
    expect(screen.getByText(/Unchecked/)).toBeTruthy();
    expect(screen.getByText(/Not the same as "no fields"/)).toBeTruthy();
    expect(screen.queryByText(/^Nothing arrives here/)).toBeNull();
  });

  it("renders the kernel's own unknown reason verbatim", () => {
    render(
      <NodeEditor
        node={choiceNode()}
        fields={{ unknown: "downstream of save_to_memory the item is the node's receipt" }}
        fieldsUnchecked={false}
        onConfig={() => {}}
        onRename={() => {}}
      />,
    );
    expect(screen.getByText(/receipt/)).toBeTruthy();
  });
});

describe("editing the other kinds", () => {
  it("a switch adds, edits and removes cases", () => {
    const onConfig = vi.fn();
    render(
      <NodeEditor
        node={{ id: "s1", kind: "switch", config: { cases: ["item.a > 1.0"] } }}
        fields={quakeFields}
        fieldsUnchecked={false}
        onConfig={onConfig}
        onRename={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("Add a case"));
    expect(onConfig).toHaveBeenCalledWith("cases", ["item.a > 1.0", ""]);
    fireEvent.click(screen.getByLabelText("remove case 0"));
    expect(onConfig).toHaveBeenCalledWith("cases", []);
  });

  it("a map edits set fields and drops", () => {
    const onConfig = vi.fn();
    render(
      <NodeEditor
        node={{ id: "m1", kind: "map", config: { set: { band: '"major"' } } }}
        fields={quakeFields}
        fieldsUnchecked={false}
        onConfig={onConfig}
        onRename={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("set:0"), {
      target: { value: '"minor"' },
    });
    expect(onConfig).toHaveBeenCalledWith("set", { band: '"minor"' });

    const drop = screen.getByPlaceholderText("add, then Enter");
    fireEvent.change(drop, { target: { value: "features" } });
    fireEvent.keyDown(drop, { key: "Enter" });
    expect(onConfig).toHaveBeenCalledWith("drop", ["features"]);
  });

  it("a notify picks a delivery mode from the closed set", () => {
    const onConfig = vi.fn();
    render(
      <NodeEditor
        node={{ id: "n1", kind: "notify", config: {} }}
        fields={quakeFields}
        fieldsUnchecked={false}
        onConfig={onConfig}
        onRename={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("at_least_once"));
    expect(onConfig).toHaveBeenCalledWith("delivery_mode", "at_least_once");
  });

  it("renames through its own field, not through config", () => {
    const onRename = vi.fn();
    render(
      <NodeEditor
        node={choiceNode()}
        fields={quakeFields}
        fieldsUnchecked={false}
        onConfig={() => {}}
        onRename={onRename}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("c1"), {
      target: { value: "major quakes only" },
    });
    expect(onRename).toHaveBeenCalledWith("major quakes only");
  });
});

describe("the condition builder", () => {
  it("says magnitude > 5 with a dropdown, a comparison and a number — no syntax", () => {
    const onConfig = vi.fn();
    render(
      <NodeEditor
        node={choiceNode()}
        fields={quakeFields}
        fieldsUnchecked={false}
        onConfig={onConfig}
        onRename={() => {}}
      />,
    );

    // An empty condition opens as an empty builder with one action.
    fireEvent.click(screen.getByText("Add a condition"));
    fireEvent.change(screen.getByLabelText("condition 0 field"), {
      target: { value: "magnitude" },
    });
    fireEvent.change(screen.getByLabelText("condition 0 value"), {
      target: { value: "5" },
    });

    // The last emit carries the whole sentence, typed correctly for CEL.
    const cel = onConfig.mock.calls.filter((c) => c[0] === "condition").pop()?.[1];
    expect(cel).toBe("item.magnitude > 5.0");
  });

  it("opens an existing built condition as rows, not as syntax", () => {
    render(
      <NodeEditor
        node={choiceNode('item.magnitude > 5.0 && item.place.contains("Turkey")')}
        fields={quakeFields}
        fieldsUnchecked={false}
        onConfig={() => {}}
        onRename={() => {}}
      />,
    );
    expect(screen.getByLabelText("condition 0 field")).toHaveValue("magnitude");
    expect(screen.getByLabelText("condition 1 comparison")).toHaveValue("contains");
    expect(screen.getByLabelText("condition 1 value")).toHaveValue("Turkey");
    expect(screen.getByText("all must match")).toBeInTheDocument();
  });

  it("shows a hand-written expression as written, and says why", () => {
    render(
      <NodeEditor
        node={choiceNode("size(item.features) > 3")}
        fields={quakeFields}
        fieldsUnchecked={false}
        onConfig={() => {}}
        onRename={() => {}}
      />,
    );
    expect(screen.getByLabelText("condition")).toHaveValue("size(item.features) > 3");
    expect(screen.getByText(/shown as written/)).toBeInTheDocument();
  });
});
