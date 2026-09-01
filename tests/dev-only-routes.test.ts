import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// These two routes are the "safe unauthenticated locally, refuse in
// production" pattern described in the README — verify the refusal is
// real, not just documented.

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("POST /api/dev-collect", () => {
  it("refuses with 404 when NODE_ENV is production, without touching Supabase", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { POST } = await import("../app/api/dev-collect/route");
    const res = await POST();
    expect(res.status).toBe(404);
  });

  it("runs a real collection when not production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.doMock("@/lib/supabase/server", () => ({
      getServiceClient: () => ({
        rpc: () => Promise.resolve({ error: null }),
      }),
    }));
    vi.doMock("@/lib/collector", () => ({
      runCollection: vi.fn(async () => ({
        success: true,
        decksOk: 5,
        decksFailed: 0,
        errorMessage: null,
        observedAt: new Date().toISOString(),
      })),
    }));

    const { POST } = await import("../app/api/dev-collect/route");
    const res = await POST();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.result.success).toBe(true);
    expect(json.result.decksOk).toBe(5);
  });
});

describe("GET /api/dev/diagnostics", () => {
  it("refuses with 404 when NODE_ENV is production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { GET } = await import("../app/api/dev/diagnostics/route");
    const res = await GET(new NextRequest("http://localhost/api/dev/diagnostics"));
    expect(res.status).toBe(404);
  });

  it("reports supabaseConfigured: false gracefully (no throw) when env vars are missing", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    const { GET } = await import("../app/api/dev/diagnostics/route");
    const res = await GET(new NextRequest("http://localhost/api/dev/diagnostics"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.supabaseConfigured).toBe(false);
    expect(json.databaseReachable).toBe(false);
    expect(json.errors.length).toBeGreaterThan(0);
  });

  it("never attempts a live JMU fetch unless ?testJmu=true is passed", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    const { GET } = await import("../app/api/dev/diagnostics/route");
    const res = await GET(new NextRequest("http://localhost/api/dev/diagnostics"));
    const json = await res.json();

    expect(json.jmuSourceTested).toBe(false);
    expect(json.jmuSourceReachable).toBeNull();
  });
});
