import { describe, expect, it } from "vitest";
import { folderAncestors, folderDepth, invalidMoveTargetIds } from "./folderExplorerModel.js";

const folders = [
  { id: "a", parentId: null, name: "A" },
  { id: "b", parentId: "a", name: "B" },
  { id: "c", parentId: "b", name: "C" },
  { id: "d", parentId: null, name: "D" },
];

describe("folder explorer model", () => {
  it("builds a root-to-leaf breadcrumb without looping", () => {
    expect(folderAncestors(folders, "c").map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(folderDepth(folders, "c")).toBe(2);
  });

  it("rejects the moving folder and all descendants as destinations", () => {
    expect([...invalidMoveTargetIds(folders, ["a"])]).toEqual(expect.arrayContaining(["a", "b", "c"]));
    expect(invalidMoveTargetIds(folders, ["a"]).has("d")).toBe(false);
  });

  it("combines invalid destinations for multiple selected folders", () => {
    const invalid = invalidMoveTargetIds(folders, ["b", "d"]);
    expect([...invalid]).toEqual(expect.arrayContaining(["b", "c", "d"]));
    expect(invalid.has("a")).toBe(false);
  });
});
