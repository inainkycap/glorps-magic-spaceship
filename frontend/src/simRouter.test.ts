import { describe, expect, it, vi } from "vitest";
import { ADVANCE_PATH, createSimRouter, RECHECK_MS, SIMULATE_PATH, type SimRouterDeps } from "./simRouter";
import type { SanctuaryAdvanceResponse, SanctuarySimRequest, SanctuarySimResponse } from "./types";

const REQ: SanctuarySimRequest = { domes: [], years: 10, runs: 100 };
const BACKEND_SIM = { tag: "backend-sim" } as unknown as SanctuarySimResponse;
const BACKEND_ADV = { tag: "backend-adv" } as unknown as SanctuaryAdvanceResponse;
const MOCK_SIM = { tag: "mock-sim" } as unknown as SanctuarySimResponse;
const MOCK_ADV = { tag: "mock-adv" } as unknown as SanctuaryAdvanceResponse;
const http = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

/**
 * A fake backend: `routes` says what each path does ("ok", an HTTP status to fail
 * with, or "down" for a network error). The probe goes to the advance path.
 */
function setup(routes: Record<string, "ok" | number | "down">, extra: Partial<SimRouterDeps> = {}) {
  const calls: string[] = [];
  const post = vi.fn(async (path: string) => {
    calls.push(path);
    const r = routes[path];
    if (r === "down") throw new TypeError("Failed to fetch");
    if (typeof r === "number") throw http(r);
    return (path === SIMULATE_PATH ? BACKEND_SIM : BACKEND_ADV) as never;
  });
  const router = createSimRouter({ post, mockSimulate: () => MOCK_SIM, mockAdvance: () => MOCK_ADV, ...extra });
  return { router, calls, post };
}

describe("sim router: Forecast and Advance always use the same model", () => {
  it("backend has no /advance yet (404): BOTH use the mock, the real /simulate is never called", async () => {
    const { router, calls } = setup({ [SIMULATE_PATH]: "ok", [ADVANCE_PATH]: 404 });
    expect(await router.simulate(REQ)).toBe(MOCK_SIM);
    expect(await router.advance(REQ)).toBe(MOCK_ADV);
    expect(router.source()).toBe("mock");
    expect(calls).toEqual([ADVANCE_PATH]); // just the one probe
  });

  it("both endpoints exist: BOTH use the backend", async () => {
    const { router, calls } = setup({ [SIMULATE_PATH]: "ok", [ADVANCE_PATH]: "ok" });
    expect(await router.simulate(REQ)).toBe(BACKEND_SIM);
    expect(await router.advance(REQ)).toBe(BACKEND_ADV);
    expect(router.source()).toBe("backend");
    expect(calls).toEqual([ADVANCE_PATH, SIMULATE_PATH, ADVANCE_PATH]); // probe, then the real calls
  });

  it("a 422 to the probe still means /advance exists", async () => {
    const { router } = setup({ [SIMULATE_PATH]: "ok", [ADVANCE_PATH]: 422 });
    await router.simulate(REQ);
    expect(router.source()).toBe("backend");
  });

  it("backend unreachable: BOTH use the mock", async () => {
    const { router } = setup({ [SIMULATE_PATH]: "down", [ADVANCE_PATH]: "down" });
    expect(await router.advance(REQ)).toBe(MOCK_ADV);
    expect(await router.simulate(REQ)).toBe(MOCK_SIM);
    expect(router.source()).toBe("mock");
  });

  it("a backend failure mid-session switches BOTH to the mock", async () => {
    const routes: Record<string, "ok" | number | "down"> = { [SIMULATE_PATH]: "ok", [ADVANCE_PATH]: "ok" };
    const { router } = setup(routes);
    expect(await router.simulate(REQ)).toBe(BACKEND_SIM);
    routes[SIMULATE_PATH] = 503;
    expect(await router.simulate(REQ)).toBe(MOCK_SIM);
    expect(router.source()).toBe("mock");
    expect(await router.advance(REQ)).toBe(MOCK_ADV); // advance follows, though /advance still works
  });

  it("real request errors (422) are thrown, not hidden behind the mock", async () => {
    const { router } = setup({ [SIMULATE_PATH]: 422, [ADVANCE_PATH]: "ok" });
    await expect(router.simulate(REQ)).rejects.toMatchObject({ status: 422 });
    expect(router.source()).toBe("backend");
  });

  it("re-checks the backend after a while, and switches back when /advance appears", async () => {
    let t = 0;
    const routes: Record<string, "ok" | number | "down"> = { [SIMULATE_PATH]: "ok", [ADVANCE_PATH]: 404 };
    const { router } = setup(routes, { now: () => t });
    expect(await router.simulate(REQ)).toBe(MOCK_SIM);
    routes[ADVANCE_PATH] = "ok"; // Annie ships it
    t += RECHECK_MS - 1;
    expect(await router.simulate(REQ)).toBe(MOCK_SIM); // not re-checked yet
    t += 2;
    expect(await router.simulate(REQ)).toBe(BACKEND_SIM);
    expect(await router.advance(REQ)).toBe(BACKEND_ADV);
  });

  it("probes once for concurrent calls, and notifies listeners of the model", async () => {
    const { router, calls } = setup({ [SIMULATE_PATH]: "ok", [ADVANCE_PATH]: 404 });
    const seen: string[] = [];
    router.onSource((s) => seen.push(s));
    await Promise.all([router.simulate(REQ), router.advance(REQ), router.simulate(REQ)]);
    expect(calls).toEqual([ADVANCE_PATH]);
    expect(seen).toEqual(["mock"]);
  });

  it("VITE_USE_MOCKS: always the mock, never the network", async () => {
    const { router, post } = setup({ [SIMULATE_PATH]: "ok", [ADVANCE_PATH]: "ok" }, { forceMock: true });
    expect(await router.simulate(REQ)).toBe(MOCK_SIM);
    expect(await router.advance(REQ)).toBe(MOCK_ADV);
    expect(post).not.toHaveBeenCalled();
    expect(router.source()).toBe("mock");
  });
});
