/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import bookmarks from "./fixtures/bookmarks.json";
import detailsModal from "./fixtures/details-modal.json";
import discover from "./fixtures/discover.json";
import home from "./fixtures/home.json";
import search from "./fixtures/search.json";
import settings from "./fixtures/settings.json";
import { Direction, NavRect, pickCandidate } from "./spatial";

/**
 * The resolver against the layouts the app really produces.
 *
 * Captured by `pnpm website:navrects` off a production build at 1920x1080
 * (DPAD_PLAN.md A12b). Hand-drawn geometry cannot test this: a grid someone
 * types out agrees with whatever the resolver already does, so it only ever
 * confirms the implementation to itself. Real surfaces are ragged, they nest,
 * they overlap, and the busiest one has 199 candidates of which about half sit
 * off-screen in a carousel.
 *
 * Nothing here asserts "→ from card 4 lands on card 5". Those are facts about
 * one build: they would break on any layout change while saying nothing about
 * whether navigation works. What is asserted are the properties a user notices
 * when they stop holding.
 */

interface FixtureRect {
  i: number;
  x: number;
  y: number;
  width: number;
  height: number;
  tag: string;
  label: string;
}

interface Fixture {
  surface: string;
  scope: string;
  count: number;
  viewport: { width: number; height: number };
  rects: FixtureRect[];
}

const DIRECTIONS: Direction[] = ["up", "down", "left", "right"];

/**
 * Candidates no sequence of key presses can reach from anywhere else on the
 * surface, by fixture.
 *
 * Zero everywhere but Settings, and the three there are real — see the test
 * below for what they are and why the fix does not belong in this step.
 */
const SURFACES: { slug: string; fixture: Fixture; unreachable: number }[] = [
  { slug: "home", fixture: home as Fixture, unreachable: 0 },
  { slug: "discover", fixture: discover as Fixture, unreachable: 0 },
  { slug: "search", fixture: search as Fixture, unreachable: 0 },
  { slug: "bookmarks", fixture: bookmarks as Fixture, unreachable: 0 },
  { slug: "settings", fixture: settings as Fixture, unreachable: 3 },
  { slug: "details-modal", fixture: detailsModal as Fixture, unreachable: 0 },
];

function toRects(fixture: Fixture): NavRect[] {
  return fixture.rects.map((r) => ({
    left: r.x,
    top: r.y,
    right: r.x + r.width,
    bottom: r.y + r.height,
    width: r.width,
    height: r.height,
  }));
}

/** Whether `landed` really is further along `direction` than `origin`. */
function isAhead(origin: NavRect, landed: NavRect, direction: Direction) {
  switch (direction) {
    case "down":
      return landed.top > origin.top;
    case "up":
      return landed.bottom < origin.bottom;
    case "right":
      return landed.left > origin.left;
    default:
      return landed.right < origin.right;
  }
}

function describeRect(r: FixtureRect) {
  return `#${r.i} ${r.tag} ${r.width}x${r.height} @${r.x},${r.y}${
    r.label ? ` "${r.label}"` : ""
  }`;
}

describe.each(SURFACES)("$slug", ({ slug, fixture, unreachable }) => {
  const rects = toRects(fixture);
  /** `moves[i][d]` — where direction `d` goes from candidate `i`. */
  const moves = rects.map((origin) =>
    DIRECTIONS.map((d) => pickCandidate(origin, rects, d)),
  );

  it("is a real capture at the pinned viewport", () => {
    // The rects are viewport-relative, so a fixture recaptured at another size
    // is not comparable to these numbers and should not silently replace them.
    expect(fixture.viewport).toEqual({ width: 1920, height: 1080 });
    expect(rects.length).toBe(fixture.count);
    expect(rects.length).toBeGreaterThan(0);
  });

  // The one thing directional navigation must never do. Everything else is
  // recoverable by pressing the opposite key; going backwards is not, because
  // then the opposite key goes backwards too and focus just oscillates.
  it("never moves against the key that was pressed", () => {
    const wrong: string[] = [];
    for (let i = 0; i < rects.length; i += 1) {
      DIRECTIONS.forEach((direction, d) => {
        const landed = moves[i][d];
        if (landed === null) return;
        if (landed === i) {
          wrong.push(
            `${describeRect(fixture.rects[i])} ${direction} -> itself`,
          );
        } else if (!isAhead(rects[i], rects[landed], direction)) {
          wrong.push(
            `${describeRect(fixture.rects[i])} ${direction} -> ${describeRect(
              fixture.rects[landed],
            )}`,
          );
        }
      });
    }
    expect(wrong).toEqual([]);
  });

  // A candidate with all four directions dead is a focus trap: the user is on
  // it, every key does nothing, and the only way out is a pointer.
  it("strands nothing with all four directions dead", () => {
    const stranded = rects
      .map((_, i) => i)
      .filter((i) => moves[i].every((to) => to === null))
      .map((i) => describeRect(fixture.rects[i]));
    expect(stranded).toEqual([]);
  });

  /**
   * The other half of the same question: not "can I leave" but "can I arrive".
   *
   * Spatial navigation is a directed graph and it is not symmetric — a
   * candidate can have somewhere to go in all four directions and still have
   * nothing at all pointing back at it. Walked from the first candidate in
   * document order, because that is where the user is: they Tab into the page
   * and then drive with the arrows. Counting "reachable from *some* start"
   * instead would forgive a pair of controls that only point at each other,
   * which is unreachable in every way that matters.
   *
   * Settings has three, all in the theme picker: 16.8px edit and delete buttons
   * tucked under the corner of a 287x131 theme preview that is itself focusable.
   * §8.4 settles an overlapping candidate before it scores anything, so → out of
   * the neighbouring control is taken by the big box it overlaps and the small
   * button never comes up. That is the spec behaving as written rather than a
   * resolver bug.
   *
   * The repair shipped in B5c, and this number does not move for it: the theme
   * card now declares itself a single column (`data-nav-grid="1"`), the same fix
   * the media cards took, so the engine reaches all three. This test scores
   * `pickCandidate` on bare rects and never sees a container, which is the point
   * of it — it measures the distance function, not the resolver above it. The
   * three are proof that geometry alone is not sufficient, which is the entire
   * argument for the container vocabulary. `website:navengine` covers the
   * repair, because only a real DOM can.
   */
  it("leaves nothing unreachable from where focus starts", () => {
    const seen = new Set<number>([0]);
    const queue = [0];
    while (queue.length) {
      const current = queue.pop() as number;
      for (const to of moves[current]) {
        if (to === null || seen.has(to)) continue;
        seen.add(to);
        queue.push(to);
      }
    }
    const orphans = rects
      .map((_, i) => i)
      .filter((i) => !seen.has(i))
      .map((i) => describeRect(fixture.rects[i]));
    expect(orphans).toHaveLength(unreachable);
  });

  it(`scores all ${
    SURFACES.find((s) => s.slug === slug)?.fixture.count
  } candidates in well under a frame`, () => {
    // A6 measured collecting the candidates at ~1ms on the busiest surface;
    // this is the other half of the per-keypress cost. Generous bound on
    // purpose — it is here to catch an accidental O(n²), not to police jitter
    // on a shared machine.
    const started = performance.now();
    for (let i = 0; i < rects.length; i += 1) {
      for (const direction of DIRECTIONS)
        pickCandidate(rects[i], rects, direction);
    }
    const perKeypress = (performance.now() - started) / (rects.length * 4);
    expect(perKeypress).toBeLessThan(2);
  });
});
