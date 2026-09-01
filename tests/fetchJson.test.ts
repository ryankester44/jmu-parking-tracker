import { describe, expect, it } from "vitest";
import { friendlyApiErrorMessage } from "../lib/fetchJson";

describe("friendlyApiErrorMessage", () => {
  it("distinguishes a network failure from a server failure", () => {
    const network = friendlyApiErrorMessage({ kind: "network", message: "fetch failed" });
    const server = friendlyApiErrorMessage({ kind: "server", status: 500, message: "boom" });
    expect(network).not.toBe(server);
    expect(network).toMatch(/reach the server/i);
  });

  it("gives a specific, actionable message for a 500 (the most common cause: Supabase misconfiguration)", () => {
    const message = friendlyApiErrorMessage({ kind: "server", status: 500, message: "Missing Supabase env vars" });
    expect(message).toMatch(/database connection failed/i);
    expect(message).toMatch(/supabase/i);
  });

  it("returns an empty string for no error (nothing to render)", () => {
    expect(friendlyApiErrorMessage(null)).toBe("");
  });
});
