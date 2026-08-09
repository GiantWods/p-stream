/* eslint-disable import/no-extraneous-dependencies */
import { describe, expect, it } from "vitest";

import { buildFullSettingsInput } from "@/backend/accounts/settings";
import { SETTINGS_FIELDS } from "@/hooks/useSettingsState";
import { usePreferencesStore } from "@/stores/preferences";

/**
 * A preference that syncs has to appear on several hand-maintained parallel
 * lists, and missing one fails silently — the toggle works, and quietly stops
 * existing on the user's other device. This is the pair of lists that can be
 * compared without React in the room.
 */
describe("settings sync", () => {
  // Theme and language reach the payload from the caller rather than from
  // preferences, so the list comparison below needs them supplied.
  const extras = {
    applicationTheme: null,
    applicationLanguage: "en",
    defaultSubtitleLanguage: "en",
  };

  it("sends every field the save button tracks", () => {
    const payload = buildFullSettingsInput(
      usePreferencesStore.getState(),
      extras,
    );

    const missing = SETTINGS_FIELDS.map((f) => f.backendKey).filter(
      (key) => !(key in payload),
    );

    expect(missing).toEqual([]);
  });

  it("carries the directional navigation preference", () => {
    const payload = buildFullSettingsInput(
      usePreferencesStore.getState(),
      extras,
    );

    expect(payload.spatialNavigation).toBe("off");
    expect(SETTINGS_FIELDS.some((f) => f.key === "spatialNavigation")).toBe(
      true,
    );
  });
});
