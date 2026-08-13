/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import bookmarks from "./fixtures/bookmarks.json";
import detailsModal from "./fixtures/details-modal.json";
import discover from "./fixtures/discover.json";
import home from "./fixtures/home.json";
import search from "./fixtures/search.json";
import settings from "./fixtures/settings.json";
import { Direction, NavRect, pickCandidate } from "./spatial";

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
    expect(fixture.viewport).toEqual({ width: 1920, height: 1080 });
    expect(rects.length).toBe(fixture.count);
    expect(rects.length).toBeGreaterThan(0);
  });

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

  it("strands nothing with all four directions dead", () => {
    const stranded = rects
      .map((_, i) => i)
      .filter((i) => moves[i].every((to) => to === null))
      .map((i) => describeRect(fixture.rects[i]));
    expect(stranded).toEqual([]);
  });

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
    const started = performance.now();
    for (let i = 0; i < rects.length; i += 1) {
      for (const direction of DIRECTIONS)
        pickCandidate(rects[i], rects, direction);
    }
    const perKeypress = (performance.now() - started) / (rects.length * 4);
    expect(perKeypress).toBeLessThan(2);
  });
});
