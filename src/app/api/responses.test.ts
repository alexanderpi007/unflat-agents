import { describe, expect, it } from "vitest";
import { apiFailure, invalidRequest } from "./responses";

describe("API error responses", () => {
  it("always includes error and detail for failures", async () => {
    const response = apiFailure(new Error("upstream unavailable"), "Operation failed.");

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Operation failed.",
      detail: "upstream unavailable",
    });
  });

  it("includes validation detail", async () => {
    const response = invalidRequest({ fieldErrors: { agentId: ["Required"] } });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid request.",
      detail: { fieldErrors: { agentId: ["Required"] } },
    });
  });
});
