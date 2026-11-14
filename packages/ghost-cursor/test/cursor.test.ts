// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { GhostCursor, resolveTarget } from "../src";
import type { CursorEvent } from "../src";

const always = () => true;
const opts = { document, allowCoordinateFallback: false, isVisible: always };

afterEach(() => {
  document.body.innerHTML = "";
});

describe("target resolution order", () => {
  it("prefers data-vistra-target over role+name", () => {
    document.body.innerHTML = `<button id="a">Invite member</button><button id="b" data-vistra-target="team.invite">Other</button>`;
    const r = resolveTarget({ id: "team.invite", role: "button", name: "Invite member" }, opts);
    expect(r.strategy).toBe("data-vistra-target");
    expect(r.element?.id).toBe("b");
  });

  it("falls back to role + accessible name", () => {
    document.body.innerHTML = `<button id="a">Invite member</button>`;
    const r = resolveTarget({ id: "missing", role: "button", name: "Invite member" }, opts);
    expect(r.strategy).toBe("role-name");
    expect(r.element?.id).toBe("a");
  });

  it("falls back to label, then data attribute, selector, text", () => {
    document.body.innerHTML = `<label for="n">Full name</label><input id="n"/>`;
    expect(resolveTarget({ label: "Full name" }, opts).strategy).toBe("label");
    document.body.innerHTML = `<div data-testid="x">hello</div>`;
    expect(resolveTarget({ attr: { name: "data-testid", value: "x" } }, opts).strategy).toBe("data-attribute");
    expect(resolveTarget({ selector: "div[data-testid]" }, opts).strategy).toBe("selector");
    expect(resolveTarget({ text: "hello" }, opts).strategy).toBe("text");
  });

  it("rejects invalid selectors and never uses coordinates unless allowed", () => {
    document.body.innerHTML = `<p>x</p>`;
    expect(resolveTarget({ selector: "p[" }, opts).element).toBeNull();
    const r = resolveTarget({ coordinates: { x: 5, y: 5 } }, opts);
    expect(r.strategy).toBeNull();
  });
});

describe("flow", () => {
  it("reports TARGET_MISSING when the element never appears", async () => {
    const events: CursorEvent[] = [];
    const c = new GhostCursor({ document, isVisible: always, retryBudgetMs: 150, reducedMotion: true, onEvent: (e) => events.push(e) });
    const res = await c.runFlow([{ target: { id: "nope" }, instruction: "x" }]);
    expect(res.status).toBe("target_missing");
    expect(res.state).toBe("TARGET_MISSING");
    expect(events.map((e) => e.type)).toEqual(["guide.started", "target.missing", "step.failed"]);
    c.destroy();
  });

  it("completes a click step when the user clicks the real element, and destroy() removes the overlay", async () => {
    document.body.innerHTML = `<button data-vistra-target="go">Go</button>`;
    const events: CursorEvent[] = [];
    const c = new GhostCursor({ document, isVisible: always, reducedMotion: true, onEvent: (e) => events.push(e) });
    const p = c.runFlow([{ target: { id: "go" }, instruction: "Click Go", action: "click" }]);
    await new Promise((r) => setTimeout(r, 80));
    expect(document.querySelector("[data-vistra-cursor-root]")).not.toBeNull();
    (document.querySelector("button") as HTMLButtonElement).click();
    const res = await p;
    expect(res.status).toBe("completed");
    expect(events.map((e) => e.type)).toEqual([
      "guide.started", "target.resolved", "cursor.moving", "cursor.hovering", "step.waiting", "step.completed", "guide.completed",
    ]);
    c.destroy();
    expect(document.querySelector("[data-vistra-cursor-root]")).toBeNull();
  });

  it("cancel() ends the flow as CANCELLED", async () => {
    document.body.innerHTML = `<button data-vistra-target="go">Go</button>`;
    const c = new GhostCursor({ document, isVisible: always, reducedMotion: true });
    const p = c.runFlow([{ target: { id: "go" }, instruction: "x", action: "click" }]);
    await new Promise((r) => setTimeout(r, 60));
    c.cancel();
    const res = await p;
    expect(res.state).toBe("CANCELLED");
    c.destroy();
  });
});

import { routeMatches, linksToRoute } from "../src";

describe("routes", () => {
  it("matches exact, params, wildcard and trailing slashes", () => {
    expect(routeMatches("/team", "/team/")).toBe(true);
    expect(routeMatches("/projects/[id]", "/projects/42")).toBe(true);
    expect(routeMatches("/projects/:id", "/projects/42/edit")).toBe(false);
    expect(routeMatches("/docs/*", "/docs/a/b")).toBe(true);
    expect(routeMatches("*", "/anything")).toBe(true);
    expect(routeMatches("/team", "/teams")).toBe(false);
  });

  it("finds same-origin links to a route", () => {
    document.body.innerHTML = `<a href="/team">Team</a><a href="https://elsewhere.example/team">Ext</a>`;
    const links = linksToRoute(document, "/team", () => true);
    expect(links.map((l) => l.textContent)).toEqual(["Team"]);
  });
});

describe("multi-page flow", () => {
  it("guides to the route, waits for SPA navigation, then resolves the target there", async () => {
    history.replaceState({}, "", "/dashboard");
    document.body.innerHTML = `<nav><a href="/team" id="nav">Team</a></nav><main></main>`;
    const events: CursorEvent[] = [];
    const c = new GhostCursor({ document, isVisible: always, reducedMotion: true, onEvent: (e) => events.push(e) });
    const p = c.runFlow([{ target: { id: "team.invite" }, route: "/team", instruction: "Invite someone", action: "click" }]);
    await new Promise((r) => setTimeout(r, 100));
    expect(events.find((e) => e.type === "step.waiting")?.detail?.action).toBe("navigate");
    // simulate the SPA route change + render
    history.pushState({}, "", "/team");
    document.querySelector("main")!.innerHTML = `<button data-vistra-target="team.invite">Invite member</button>`;
    await new Promise((r) => setTimeout(r, 900));
    (document.querySelector("button") as HTMLButtonElement).click();
    const res = await p;
    expect(res.status).toBe("completed");
    expect(events.some((e) => e.type === "target.resolved")).toBe(true);
    c.destroy();
  });

  it("reports route_not_reached after the navigation timeout", async () => {
    history.replaceState({}, "", "/dashboard");
    document.body.innerHTML = `<a href="/billing">Billing</a>`;
    const c = new GhostCursor({ document, isVisible: always, reducedMotion: true, navigationTimeoutMs: 300 });
    const res = await c.runFlow([{ target: { id: "x" }, route: "/billing", instruction: "x" }]);
    expect(res.status).toBe("route_not_reached");
    c.destroy();
  });

  it("resumes at startAt", async () => {
    history.replaceState({}, "", "/");
    document.body.innerHTML = `<button data-vistra-target="b">B</button>`;
    const c = new GhostCursor({ document, isVisible: always, reducedMotion: true, autoAdvanceMs: 50 });
    const res = await c.runFlow([{ target: { id: "a" }, instruction: "a" }, { target: { id: "b" }, instruction: "b" }], { startAt: 1 });
    expect(res.status).toBe("completed");
    expect(res.completedSteps).toBe(2);
    c.destroy();
  });
});
