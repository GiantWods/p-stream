/**
 * The `?navdebug=1` probe: draws a numbered box over every element directional
 * navigation would consider, outlines the containers the resolver has resolved
 * around focus, and reports how many candidates there are, how long finding them
 * took, and how many are scrolled out of view.
 *
 * This exists to answer questions the navigation code cannot be written without
 * — whether a linear scan over the candidate set is affordable per keypress, and
 * how much of the page is off-screen at any moment. It is loaded only when the
 * flag is set (see `navDebug.ts`), so it is a separate chunk and normal users
 * never fetch it.
 *
 * The container half was added for B4, and it is the only way to tell a working
 * hint from a typo. Container hints fail silently: a `data-nav-row` on the
 * scroll viewport instead of the track, or a `data-nav-grid="4"` on a grid that
 * reflows to three columns at this width, still navigates — it just lands
 * somewhere slightly wrong, which from the outside is indistinguishable from the
 * geometry being off. B5 annotates nine surfaces, and doing that blind is
 * guesswork.
 *
 * Chromium 76 safe: no `inset`, no optional chaining in the emitted output
 * beyond what the build already downlevels, no `checkVisibility`.
 */

import {
  FOCUSABLE_SELECTOR,
  collectFocusables,
} from "@/utils/browser/focusables";
import { getActiveScope, getScopeDepth } from "@/utils/browser/focusScopes";
import {
  NavContainer,
  containerChain,
  resolveSearchRoot,
} from "@/utils/navigation/containers";

const CONTAINER_ID = "nav-debug-overlay";

/** Per-kind outline colours. Distinct in hue, not just lightness. */
const CONTAINER_COLOURS: Record<string, string> = {
  scope: "#ff3b6b",
  grid: "#3bd6ff",
  row: "#a78bfa",
  none: "#ffc93b",
};

/** How many times to run the collection when timing it. */
const TIMING_RUNS = 5;

export interface NavDebugReport {
  /** Where the candidates were collected from. */
  scope: string;
  /** Depth of the focus-scope stack (see `focusScopes.ts`). */
  scopeDepth: number;
  /** Visible focusables found. */
  count: number;
  /** How many of those lie entirely outside the viewport. */
  offscreen: number;
  /**
   * Of the offscreen ones, how many are off to the left or right rather than
   * above or below. These are the carousel items: the rows render every item
   * into an `overflow-x-scroll` container, so they are real, focusable, and
   * unreachable without scrolling the row. Vertical overflow is just a long
   * page and behaves normally.
   */
  offscreenX: number;
  /** Median of `TIMING_RUNS` collections, in milliseconds. */
  medianMs: number;
  /** Slowest of `TIMING_RUNS` collections, in milliseconds. */
  worstMs: number;
  /**
   * The container chain resolved around the focused element, innermost first,
   * as the labels drawn on screen. Empty on an unannotated surface, which is
   * itself the answer when a hint was expected to be there.
   */
  containers: string[];
}

function getContainer(): HTMLElement {
  const existing = document.getElementById(CONTAINER_ID);
  if (existing) return existing;
  const el = document.createElement("div");
  el.id = CONTAINER_ID;
  // No tabindex anywhere in here, so the probe never shows up in its own
  // results. Explicit top/left/width/height rather than `inset`, which needs
  // Chromium 87.
  el.style.cssText =
    "position:fixed;top:0;left:0;width:100%;height:100%;" +
    "pointer-events:none;z-index:2147483647";
  document.body.appendChild(el);
  return el;
}

function isOffscreenX(rect: DOMRect): boolean {
  return rect.right <= 0 || rect.left >= window.innerWidth;
}

function isOffscreenY(rect: DOMRect): boolean {
  return rect.bottom <= 0 || rect.top >= window.innerHeight;
}

function isOffscreen(rect: DOMRect): boolean {
  return isOffscreenX(rect) || isOffscreenY(rect);
}

/** `row + remember` etc, or `?` for a grid that gave no usable column count. */
export function describeContainer(entry: NavContainer): string {
  const parts: string[] = [];
  if (entry.isScope) parts.push("scope");
  if (entry.kind === "grid") {
    parts.push(`grid ${entry.columns === null ? "?" : entry.columns}`);
  } else if (entry.kind === "row") parts.push("row");
  if (entry.remembers) parts.push("remember");
  return parts.join(" + ");
}

function containerKind(entry: NavContainer): string {
  return entry.isScope ? "scope" : entry.kind;
}

/**
 * The containers around focus, dashed and labelled with their depth.
 *
 * Drawn on top of the candidate boxes and inset by depth so nested containers
 * stay distinguishable when they share an edge — a `data-nav-row` on the track
 * and another on the viewport around it are the exact mistake this has to be
 * able to show.
 */
function drawContainers(frag: DocumentFragment, chain: NavContainer[]) {
  for (let depth = 0; depth < chain.length; depth += 1) {
    const entry = chain[depth];
    const rect = entry.el.getBoundingClientRect();
    const colour = CONTAINER_COLOURS[containerKind(entry)];
    const inset = depth * 2;

    const box = document.createElement("div");
    box.style.cssText =
      `position:absolute;left:${rect.left + inset}px;top:${rect.top + inset}px;` +
      `width:${Math.max(0, rect.width - inset * 2)}px;` +
      `height:${Math.max(0, rect.height - inset * 2)}px;` +
      `outline:2px dashed ${colour}`;

    const label = document.createElement("div");
    label.textContent = `${depth} ${describeContainer(entry)}`;
    label.style.cssText =
      `position:absolute;right:0;bottom:0;background:${colour};color:#000;` +
      "font:700 10px/1.2 monospace;padding:1px 3px;white-space:nowrap";
    box.appendChild(label);
    frag.appendChild(box);
  }
}

function draw(candidates: HTMLElement[], chain: NavContainer[]) {
  const container = getContainer();
  container.innerHTML = "";
  const frag = document.createDocumentFragment();

  for (let i = 0; i < candidates.length; i += 1) {
    const rect = candidates[i].getBoundingClientRect();
    const outside = isOffscreen(rect);
    const colour = outside ? "#ff9d2e" : "#4ade80";

    const marker = document.createElement("div");
    marker.style.cssText =
      `position:absolute;left:${rect.left}px;top:${rect.top}px;` +
      `width:${rect.width}px;height:${rect.height}px;` +
      `outline:1px solid ${colour};` +
      `background:${outside ? "rgba(255,157,46,.08)" : "rgba(74,222,128,.08)"}`;

    const label = document.createElement("div");
    label.textContent = String(i);
    label.style.cssText =
      `position:absolute;left:0;top:0;background:${colour};color:#000;` +
      "font:700 10px/1.2 monospace;padding:1px 3px";
    marker.appendChild(label);
    frag.appendChild(marker);
  }

  drawContainers(frag, chain);
  container.appendChild(frag);
}

/** One candidate's geometry, as the resolver will see it. */
export interface NavRectEntry {
  /** Document-order index, matching `collectFocusables()`. */
  i: number;
  /** Viewport-relative, from `getBoundingClientRect()`, rounded to 2dp. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Identity, so a failing geometry assertion says which control it is. */
  tag: string;
  label: string;
}

export interface NavRectDump {
  scope: string;
  scopeDepth: number;
  /** Rects are viewport-relative, so they only mean anything at this size. */
  viewport: { width: number; height: number };
  /**
   * Where the page was scrolled when this was taken. Not needed to interpret
   * the rects — it is here so a dump can be reproduced, since scrolling a
   * carousel changes which candidates are on screen without changing the DOM.
   */
  scroll: { x: number; y: number };
  count: number;
  rects: NavRectEntry[];
}

/** Best-effort human name for a candidate. Only ever used in test output. */
function describeCandidate(el: HTMLElement): string {
  const attr =
    el.getAttribute("aria-label") ||
    el.getAttribute("placeholder") ||
    el.getAttribute("title");
  if (attr) return attr.trim().slice(0, 40);
  const text = (el.textContent || "").replace(/\s+/g, " ").trim();
  if (text) return text.slice(0, 40);
  return "";
}

function describeScope(scope: HTMLElement | null): string {
  if (!scope) return "document";
  const classes = scope.className
    ? `.${String(scope.className).trim().split(/\s+/).join(".")}`
    : "";
  return `${scope.tagName.toLowerCase()}${classes}`;
}

/**
 * The candidate set as pure geometry, for B1's resolver fixtures.
 *
 * `measure()` reports counts and timings, which answered A6's questions but
 * cannot be asserted against. The resolver is a pure function over rects, and
 * the one thing it must not be tuned against is geometry someone typed out by
 * hand — a hand-drawn grid agrees with whatever the resolver already does.
 * This returns the real thing instead, so the unit tests run on the layout the
 * app actually produces. `scripts/website-navrects.mjs` drives it across the
 * surfaces and writes the fixtures.
 *
 * Rounded to 2dp: subpixel layout jitter would otherwise churn the committed
 * fixtures on every capture, and no navigation decision turns on 1/100th of a
 * pixel.
 */
export function dumpRects(): NavRectDump {
  const scope = getActiveScope();
  const root: HTMLElement | Document = scope ?? document;
  const candidates = collectFocusables(root);
  const round = (n: number) => Math.round(n * 100) / 100;

  const rects: NavRectEntry[] = [];
  for (let i = 0; i < candidates.length; i += 1) {
    const el = candidates[i];
    const rect = el.getBoundingClientRect();
    rects.push({
      i,
      x: round(rect.left),
      y: round(rect.top),
      width: round(rect.width),
      height: round(rect.height),
      tag: el.tagName.toLowerCase(),
      label: describeCandidate(el),
    });
  }

  return {
    scope: describeScope(scope),
    scopeDepth: getScopeDepth(),
    viewport: { width: window.innerWidth, height: window.innerHeight },
    scroll: { x: window.scrollX, y: window.scrollY },
    count: rects.length,
    rects,
  };
}

/**
 * Collects, times, draws, and returns the numbers. Safe to call by hand from a
 * console — `window.__navDebug.measure()` — which is how this runs on a TV,
 * where there is no address bar to put the flag in.
 */
export function measure(): NavDebugReport {
  const scope = getActiveScope();
  const active = document.activeElement;
  const focused = active instanceof HTMLElement ? active : null;

  // `resolveSearchRoot` rather than the scope alone, so this reports the
  // candidate set the engine will really search — a `data-nav-scope` inside an
  // open modal narrows it further, and a probe that disagrees with the engine
  // about that is worse than no probe.
  const root: HTMLElement | Document =
    focused === null ? (scope ?? document) : resolveSearchRoot(focused);
  const chain = focused === null ? [] : containerChain(focused, root);

  // Timed repeatedly because the first run pays for a layout flush that the
  // rest reuse. Both numbers are reported: the median is what a keypress costs
  // in a settled page, the worst is closer to what it costs right after a
  // render.
  const times: number[] = [];
  let candidates: HTMLElement[] = [];
  for (let i = 0; i < TIMING_RUNS; i += 1) {
    const start = performance.now();
    candidates = collectFocusables(root);
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);

  let offscreen = 0;
  let offscreenX = 0;
  for (let i = 0; i < candidates.length; i += 1) {
    const rect = candidates[i].getBoundingClientRect();
    if (!isOffscreen(rect)) continue;
    offscreen += 1;
    if (isOffscreenX(rect)) offscreenX += 1;
  }

  draw(candidates, chain);

  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    scope: describeScope(scope),
    scopeDepth: getScopeDepth(),
    count: candidates.length,
    offscreen,
    offscreenX,
    medianMs: round(times[Math.floor(TIMING_RUNS / 2)]),
    worstMs: round(times[TIMING_RUNS - 1]),
    containers: chain.map(describeContainer),
  };
}

let lastSignature = "";
let scheduled = 0;

function report() {
  scheduled = 0;
  const result = measure();
  // Only log when something changed, so a page that is merely animating does
  // not bury the numbers that matter.
  const signature = [
    result.scope,
    result.count,
    result.offscreen,
    result.offscreenX,
    result.containers.join(">"),
  ].join("|");
  if (signature === lastSignature) return;
  lastSignature = signature;
  // eslint-disable-next-line no-console
  console.log(
    `[navdebug] ${result.count} candidates in ${result.scope} ` +
      `(depth ${result.scopeDepth}), ${result.offscreen} offscreen ` +
      `(${result.offscreenX} sideways), ` +
      `${result.medianMs}ms median / ${result.worstMs}ms worst, ` +
      `containers [${result.containers.join(" < ") || "none"}]`,
    result,
  );
}

function schedule() {
  if (scheduled) return;
  scheduled = window.setTimeout(report, 250);
}

/** Starts the probe. Returns a teardown, mostly so this is testable. */
export function startNavDebug(): () => void {
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style", "tabindex", "disabled", "hidden"],
  });

  // Scrolling changes which candidates are offscreen without changing the DOM,
  // and it is the whole reason the offscreen count is interesting: the
  // carousels render every item into an `overflow-x-scroll` container.
  window.addEventListener("scroll", schedule, true);
  window.addEventListener("resize", schedule);

  // The container outlines are drawn around whatever has focus, so they have to
  // be redrawn when focus moves. The MutationObserver above does not see that:
  // moving focus changes no attribute in its filter.
  document.addEventListener("focusin", schedule);

  // The underlying pieces go on the handle too, so a measurement script or a
  // TV inspector session can ask its own questions without reimplementing the
  // selector and drifting from it.
  (window as any).__navDebug = {
    measure,
    dumpRects,
    collectFocusables,
    getActiveScope,
    containerChain,
    resolveSearchRoot,
    FOCUSABLE_SELECTOR,
  };
  report();

  return () => {
    observer.disconnect();
    window.removeEventListener("scroll", schedule, true);
    window.removeEventListener("resize", schedule);
    document.removeEventListener("focusin", schedule);
    if (scheduled) window.clearTimeout(scheduled);
    scheduled = 0;
    const container = document.getElementById(CONTAINER_ID);
    if (container) container.remove();
    delete (window as any).__navDebug;
  };
}
