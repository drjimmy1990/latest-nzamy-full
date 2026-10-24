import { test } from "node:test";
import assert from "node:assert/strict";
import { forceDarkThemeValue } from "./forceDarkTheme.ts";

function parent(theme: "light" | "dark") {
  const calls: string[] = [];
  const record = (name: string) => (...args: unknown[]) => {
    void args;
    calls.push(name);
  };
  const value = {
    theme,
    lang: "ar" as const,
    calendarType: "both" as const,
    density: 75,
    isDark: theme === "dark",
    isRTL: true,
    toggleTheme: record("toggleTheme"),
    toggleLang: record("toggleLang"),
    setLang: record("setLang"),
    setTheme: record("setTheme"),
    setCalendarType: record("setCalendarType"),
    setDensity: record("setDensity"),
    t: "ar" as const,
  };
  return { value, calls };
}

test("forceDarkThemeValue: dark whatever the site theme is", () => {
  for (const theme of ["light", "dark"] as const) {
    const forced = forceDarkThemeValue(parent(theme).value);
    assert.equal(forced.theme, "dark");
    assert.equal(forced.isDark, true);
  }
});

test("forceDarkThemeValue: the theme setters are no-ops; everything else is the parent's", () => {
  const { value, calls } = parent("light");
  const forced = forceDarkThemeValue(value);
  forced.toggleTheme();
  forced.setTheme("light");
  assert.deepEqual(calls, []);
  assert.equal(forced.isDark, true);
  // the rest passes through untouched
  for (const key of ["lang", "calendarType", "density", "isRTL", "t", "toggleLang", "setLang", "setCalendarType", "setDensity"] as const) {
    assert.equal(forced[key], value[key], key);
  }
  forced.setLang("en");
  forced.setDensity(85);
  assert.deepEqual(calls, ["setLang", "setDensity"]);
  // the parent value is not mutated
  assert.equal(value.theme, "light");
  assert.equal(value.isDark, false);
});
