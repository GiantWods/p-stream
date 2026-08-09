/* eslint-disable import/no-extraneous-dependencies */
import { afterEach, describe, expect, it } from "vitest";

import {
  isEditableTarget,
  ownsArrowKeys,
  ownsKeyboardInput,
} from "./keyboardTarget";

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body.firstElementChild as HTMLElement;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("isEditableTarget", () => {
  it("accepts text-entry elements", () => {
    expect(isEditableTarget(mount("<input />"))).toBe(true);
    expect(isEditableTarget(mount('<input type="text" />'))).toBe(true);
    expect(isEditableTarget(mount('<input type="search" />'))).toBe(true);
    expect(isEditableTarget(mount('<input type="password" />'))).toBe(true);
    expect(isEditableTarget(mount('<input type="number" />'))).toBe(true);
    expect(isEditableTarget(mount("<textarea></textarea>"))).toBe(true);
    expect(isEditableTarget(mount('<div contenteditable="true"></div>'))).toBe(
      true,
    );
    expect(isEditableTarget(mount('<div role="textbox"></div>'))).toBe(true);
  });

  it("rejects controls that don't take typed text", () => {
    expect(isEditableTarget(mount('<input type="checkbox" />'))).toBe(false);
    expect(isEditableTarget(mount('<input type="range" />'))).toBe(false);
    expect(isEditableTarget(mount('<input type="button" />'))).toBe(false);
    expect(isEditableTarget(mount('<input type="color" />'))).toBe(false);
    expect(isEditableTarget(mount("<button></button>"))).toBe(false);
    expect(isEditableTarget(mount("<select></select>"))).toBe(false);
    expect(isEditableTarget(mount("<div></div>"))).toBe(false);
  });

  it("treats an unrecognised input type as text", () => {
    expect(isEditableTarget(mount('<input type="not-a-real-type" />'))).toBe(
      true,
    );
  });

  it("finds contenteditable on an ancestor but honours an explicit false", () => {
    const editable = mount(
      '<div contenteditable="true"><span id="inner">x</span></div>',
    );
    expect(isEditableTarget(editable.querySelector("#inner"))).toBe(true);

    const disabled = mount(
      '<div contenteditable="false"><span id="inner">x</span></div>',
    );
    expect(isEditableTarget(disabled.querySelector("#inner"))).toBe(false);
  });

  it("ignores non-element targets", () => {
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget(window)).toBe(false);
    expect(isEditableTarget(document)).toBe(false);
  });
});

describe("ownsKeyboardInput", () => {
  // The two call sites this replaced tested `nodeName === "INPUT"`, so every
  // input must keep returning true regardless of type — otherwise a shortcut
  // that is suppressed today would start firing.
  it("covers every input type, not just text ones", () => {
    expect(ownsKeyboardInput(mount('<input type="range" />'))).toBe(true);
    expect(ownsKeyboardInput(mount('<input type="checkbox" />'))).toBe(true);
    expect(ownsKeyboardInput(mount('<input type="color" />'))).toBe(true);
    expect(ownsKeyboardInput(mount('<input type="file" />'))).toBe(true);
    expect(ownsKeyboardInput(mount("<input />"))).toBe(true);
  });

  it("adds the cases the old nodeName check missed", () => {
    expect(ownsKeyboardInput(mount("<textarea></textarea>"))).toBe(true);
    expect(ownsKeyboardInput(mount("<select></select>"))).toBe(true);
    expect(ownsKeyboardInput(mount('<div contenteditable="true"></div>'))).toBe(
      true,
    );
    expect(ownsKeyboardInput(mount('<div role="textbox"></div>'))).toBe(true);
  });

  it("leaves ordinary controls alone so shortcuts still fire", () => {
    expect(ownsKeyboardInput(mount("<button></button>"))).toBe(false);
    expect(ownsKeyboardInput(mount('<a href="#">x</a>'))).toBe(false);
    expect(ownsKeyboardInput(mount('<div tabindex="0"></div>'))).toBe(false);
    expect(ownsKeyboardInput(null)).toBe(false);
  });
});

// The predicate directional navigation gates on. It has to sit between the
// other two: `isEditableTarget` would let the engine move focus off a slider
// while the slider also changed value, and `ownsKeyboardInput` would leave a
// D-pad user permanently parked on a checkbox.
describe("ownsArrowKeys", () => {
  it("covers controls the arrows drive the value of", () => {
    expect(ownsArrowKeys(mount("<select></select>"))).toBe(true);
    expect(ownsArrowKeys(mount('<input type="range" />'))).toBe(true);
    expect(ownsArrowKeys(mount('<input type="number" />'))).toBe(true);
    expect(ownsArrowKeys(mount('<input type="date" />'))).toBe(true);
    expect(ownsArrowKeys(mount('<input type="time" />'))).toBe(true);
  });

  it("covers text entry, where the arrows move the caret", () => {
    expect(ownsArrowKeys(mount("<input />"))).toBe(true);
    expect(ownsArrowKeys(mount('<input type="search" />'))).toBe(true);
    expect(ownsArrowKeys(mount("<textarea></textarea>"))).toBe(true);
    expect(ownsArrowKeys(mount('<div contenteditable="true"></div>'))).toBe(true);
    expect(ownsArrowKeys(mount('<div role="textbox"></div>'))).toBe(true);
  });

  // Being unable to arrow off a control is worse than any shortcut conflict:
  // on a remote there is no pointer to escape with.
  it("leaves controls that mean nothing by an arrow navigable", () => {
    expect(ownsArrowKeys(mount('<input type="checkbox" />'))).toBe(false);
    expect(ownsArrowKeys(mount('<input type="radio" />'))).toBe(false);
    expect(ownsArrowKeys(mount('<input type="button" />'))).toBe(false);
    expect(ownsArrowKeys(mount('<input type="file" />'))).toBe(false);
    expect(ownsArrowKeys(mount('<input type="color" />'))).toBe(false);
    expect(ownsArrowKeys(mount("<button></button>"))).toBe(false);
    expect(ownsArrowKeys(mount('<a href="#">x</a>'))).toBe(false);
    expect(ownsArrowKeys(mount('<div tabindex="0"></div>'))).toBe(false);
    expect(ownsArrowKeys(null)).toBe(false);
  });

  it("sits strictly between the other two predicates", () => {
    const checkbox = mount('<input type="checkbox" />');
    expect(isEditableTarget(checkbox)).toBe(false);
    expect(ownsArrowKeys(checkbox)).toBe(false);
    expect(ownsKeyboardInput(checkbox)).toBe(true);

    const range = mount('<input type="range" />');
    expect(isEditableTarget(range)).toBe(false);
    expect(ownsArrowKeys(range)).toBe(true);
    expect(ownsKeyboardInput(range)).toBe(true);
  });
});
