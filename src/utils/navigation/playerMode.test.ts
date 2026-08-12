/* eslint-disable import/no-extraneous-dependencies */
import { afterEach, describe, expect, it } from "vitest";

import {
  canEnterWidgetMode,
  canEnterWidgetModeByArrow,
  isArrowKey,
  isWidgetArrowEntry,
  isWidgetEntryKey,
  isWidgetExitKey,
} from "./playerMode";

function key(name: string, init: KeyboardEventInit = {}) {
  return new KeyboardEvent("keydown", { key: name, ...init });
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("isWidgetEntryKey", () => {
  it("is OK, and OK is Enter", () => {
    expect(isWidgetEntryKey(key("Enter"))).toBe(true);
  });

  // Space, `k` and `m` are transport bindings the player keeps in either mode.
  // The arrows are a second way in and have their own predicate below — what
  // this one says is that they are not *this* way in, because the two differ on
  // what focus has to look like first.
  it.each([" ", "k", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "m"])(
    "is not %s",
    (k) => {
      expect(isWidgetEntryKey(key(k))).toBe(false);
    },
  );

  it("is not a chord", () => {
    expect(isWidgetEntryKey(key("Enter", { shiftKey: true }))).toBe(false);
    expect(isWidgetEntryKey(key("Enter", { altKey: true }))).toBe(false);
    expect(isWidgetEntryKey(key("Enter", { ctrlKey: true }))).toBe(false);
    expect(isWidgetEntryKey(key("Enter", { metaKey: true }))).toBe(false);
  });

  // Held OK is one press. Without this the mode would be entered, and its entry
  // point resolved, once per repeat tick.
  it("is not a repeat", () => {
    expect(isWidgetEntryKey(key("Enter", { repeat: true }))).toBe(false);
  });
});

describe("isWidgetExitKey", () => {
  it("is Escape and the two TV back codes", () => {
    expect(isWidgetExitKey(key("Escape"))).toBe(true);
    expect(isWidgetExitKey(key("Unidentified", { keyCode: 10009 }))).toBe(true);
    expect(isWidgetExitKey(key("Unidentified", { keyCode: 461 }))).toBe(true);
  });

  it("is not the key that got us here", () => {
    expect(isWidgetExitKey(key("Enter"))).toBe(false);
  });
});

describe("canEnterWidgetMode", () => {
  // Transport mode leaves focus on `<body>` — there is nothing in the player
  // for it to be on — so this is the state a remote is always in.
  it("allows it when focus is nowhere", () => {
    expect(canEnterWidgetMode()).toBe(true);
  });

  // A mouse user who clicked Pause and then pressed Enter: the button activates
  // on this press by itself, and switching mode as well would make one key do
  // two unrelated things.
  it("refuses when focus is already on a control", () => {
    const button = document.createElement("button");
    document.body.append(button);
    button.focus();

    expect(canEnterWidgetMode()).toBe(false);
  });
});

describe("isArrowKey", () => {
  it.each(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"])("is %s", (k) => {
    expect(isArrowKey(key(k))).toBe(true);
  });

  // The transport handler's question, and it has to include the chords: → with
  // Shift held is not a direction the engine acts on, but it is still an arrow,
  // and seeking on it while the plain key navigates is the surprise the split
  // exists to remove.
  it("is an arrow whatever is held with it", () => {
    expect(isArrowKey(key("ArrowLeft", { altKey: true }))).toBe(true);
    expect(isArrowKey(key("ArrowRight", { shiftKey: true }))).toBe(true);
  });

  it.each(["Enter", " ", "k", "Home"])("is not %s", (k) => {
    expect(isArrowKey(key(k))).toBe(false);
  });
});

describe("isWidgetArrowEntry", () => {
  it.each(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"])(
    "opens the mode on %s",
    (k) => {
      expect(isWidgetArrowEntry(key(k))).toBe(true);
    },
  );

  // A held arrow arrives with `repeat` set from the second tick on. Refusing
  // those would hand every tick after the first to the transport handler, which
  // is the seek this change is removing.
  it("counts a repeat, unlike OK", () => {
    expect(isWidgetArrowEntry(key("ArrowDown", { repeat: true }))).toBe(true);
  });

  it("is not a chord", () => {
    expect(isWidgetArrowEntry(key("ArrowUp", { altKey: true }))).toBe(false);
    expect(isWidgetArrowEntry(key("ArrowUp", { ctrlKey: true }))).toBe(false);
    expect(isWidgetArrowEntry(key("ArrowUp", { metaKey: true }))).toBe(false);
    expect(isWidgetArrowEntry(key("ArrowUp", { shiftKey: true }))).toBe(false);
  });

  it("is not OK, or anything else", () => {
    expect(isWidgetArrowEntry(key("Enter"))).toBe(false);
    expect(isWidgetArrowEntry(key(" "))).toBe(false);
  });
});

describe("canEnterWidgetModeByArrow", () => {
  function player() {
    const root = document.createElement("div");
    root.setAttribute("data-nav-skip", "");
    const control = document.createElement("button");
    root.append(control);
    document.body.append(root);
    return { root, control };
  }

  it("allows it when focus is nowhere", () => {
    const { root } = player();

    expect(canEnterWidgetModeByArrow(document.body, root)).toBe(true);
  });

  // The case OK cannot serve. A mouse user who clicked Pause has focus on a
  // control inside a skipped subtree, so `canEnterWidgetMode` refuses forever
  // and every arrow would go on seeking.
  it("allows it with focus on a control inside the player", () => {
    const { root, control } = player();
    control.focus();

    expect(canEnterWidgetModeByArrow(control, root)).toBe(true);
  });

  it("refuses when focus is outside the player", () => {
    const { root } = player();
    const elsewhere = document.createElement("button");
    document.body.append(elsewhere);
    elsewhere.focus();

    expect(canEnterWidgetModeByArrow(elsewhere, root)).toBe(false);
  });

  // A field drives its own value by the arrows, and the player has fields in it
  // — the settings popout is inside the same subtree.
  it("refuses when the target drives its value by the arrows", () => {
    const { root } = player();
    const input = document.createElement("input");
    root.append(input);
    input.focus();

    expect(canEnterWidgetModeByArrow(input, root)).toBe(false);
  });

  // The same rule the engine applies to a field anywhere else: it keeps the keys
  // that move its caret and gives back the ones that cannot. Without the second
  // half, a mouse user who clicked into a field in the settings popout has an ↑
  // that neither types, nor navigates, nor changes the volume any more.
  it("asks the field about the arrow that was actually pressed", () => {
    const { root } = player();
    const input = document.createElement("input");
    input.value = "hello";
    root.append(input);
    input.focus();
    input.setSelectionRange(2, 2);

    expect(canEnterWidgetModeByArrow(input, root, "left")).toBe(false);
    expect(canEnterWidgetModeByArrow(input, root, "up")).toBe(true);
  });

  it("refuses with no player to enter, unless focus is nowhere", () => {
    const elsewhere = document.createElement("button");
    document.body.append(elsewhere);
    elsewhere.focus();

    expect(canEnterWidgetModeByArrow(elsewhere, null)).toBe(false);
  });
});
