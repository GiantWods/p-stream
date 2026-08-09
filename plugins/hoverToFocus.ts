import type { Plugin, Rule } from "postcss";

/**
 * Clones every rule whose selector contains `:hover` into a `:focus` /
 * `:focus-within` twin, gated on keyboard input modality.
 *
 * Nearly all interactivity in this app is expressed through `:hover` and
 * Tailwind's `group-hover:` / `hover:` utilities. There is no hover under a
 * keyboard, a D-pad or a gamepad, so without this the app is navigable but
 * looks inert — focus moves and almost nothing on screen responds.
 *
 * The gate is what makes this safe on the web. `:focus` fires on mouse click
 * too, so an ungated mirror would leave every clicked button stuck looking
 * hovered. Clones only apply while `<html>` carries
 * `data-input-modality="key"`, which `src/utils/browser/inputModality.ts`
 * sets from real key, D-pad and gamepad input:
 *
 *     .foo:hover            →  html[…="key"] .foo:focus
 *     .group:hover .bar     →  html[…="key"] .group:focus-within .bar
 *
 * Additive only: it duplicates rules and never edits the source, so it stays
 * correct as new hover styles are added.
 */

const MODALITY = '[data-input-modality="key"]';

export interface HoverToFocusOptions {
  /**
   * Also mirror onto `:focus-within`. On by default, and it carries most of
   * the weight: `.group` is usually a plain wrapper `<div>` that can never
   * match `:focus` itself, so `.group:hover .child` rules — a third of all
   * the hover rules here — only come alive through `:focus-within`.
   */
  focusWithin?: boolean;
}

/**
 * Scopes one selector to keyboard modality.
 *
 * The attribute lives on `<html>`, so the usual answer is a descendant
 * prefix. Two cases can't take one:
 *
 * - Selectors already rooted at `html` / `:root`, where the attribute has to
 *   be merged into that compound instead of demanding a descendant.
 * - Selectors starting with `[dir=…]`, which postcss-rtlcss emits and which
 *   in practice match `<html dir>`. Same treatment. (A nested `dir` — the
 *   player forces `dir="ltr"` on a few controls — would no longer match, but
 *   every `[dir]` hover rule here is an RTL margin flip, not interactive
 *   feedback, so nothing visible is lost.)
 *
 * Returns null for selectors that can't hold focus at all.
 */
function scopeToKeyModality(selector: string): string | null {
  const trimmed = selector.trim();

  // ::-webkit-scrollbar-thumb, ::-moz-range-thumb and friends. These are
  // shadow pseudo-elements: they take :hover but can never take focus, so a
  // twin would be dead weight at best.
  //
  // Matched on the vendor prefix rather than on `::` at all, which is what this
  // did first and which was too broad. A pseudo-element on a real element is a
  // perfectly good mirror target — `.group:hover .field::placeholder` is one
  // that exists here — and dropping those loses exactly the feedback this
  // plugin is for. The vendor-prefixed ones are the only shadow pseudo-elements
  // in this stylesheet.
  if (/::-/.test(trimmed)) return null;

  const rooted = /^(html|:root|\[dir[^\]]*\])/.exec(trimmed);
  if (rooted) {
    return trimmed.slice(0, rooted[0].length) + MODALITY + trimmed.slice(rooted[0].length);
  }

  return `html${MODALITY} ${trimmed}`;
}

export function hoverToFocus(options: HoverToFocusOptions = {}): Plugin {
  const focusWithin = options.focusWithin ?? true;

  return {
    postcssPlugin: "hover-to-focus",
    OnceExit(root) {
      const clones: Array<{ anchor: Rule; clone: Rule }> = [];

      root.walkRules(/:hover\b/, (rule) => {
        const scoped: string[] = [];

        for (const selector of rule.selectors) {
          // A rule's selector list can mix hover and non-hover selectors.
          // Only the hover ones have a twin; copying the rest would apply the
          // hover styling unconditionally.
          if (!/:hover\b/.test(selector)) continue;

          const focus = scopeToKeyModality(selector.replace(/:hover\b/g, ":focus"));
          if (focus) scoped.push(focus);

          if (focusWithin) {
            const within = scopeToKeyModality(
              selector.replace(/:hover\b/g, ":focus-within"),
            );
            if (within) scoped.push(within);
          }
        }

        if (scoped.length === 0) return;
        clones.push({ anchor: rule, clone: rule.clone({ selector: scoped.join(", ") }) });
      });

      // Inserted after the walk so the clones aren't themselves walked.
      clones.forEach(({ anchor, clone }) => anchor.after(clone));
    },
  };
}
