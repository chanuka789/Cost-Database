import { describe, expect, it } from "vitest";
import { findSimilarProject, nameKey } from "./project-match";

describe("project name matching", () => {
  it("treats spacing, hyphens and capitals as the same name", () => {
    expect(nameKey("Q WALK")).toBe(nameKey("Q-Walk"));
    expect(nameKey("Al-Nakheel  Park")).toBe(nameKey("al nakheel park"));
  });
  it("finds the existing project for a cover name", () => {
    const projects = [{ id: "1", name: "Q-Walk" }, { id: "2", name: "Marina Tower" }];
    expect(findSimilarProject("Q WALK", projects)?.id).toBe("1");
    expect(findSimilarProject("Marina Towers", projects)).toBeUndefined();
    expect(findSimilarProject("-", projects)).toBeUndefined();
  });
});
