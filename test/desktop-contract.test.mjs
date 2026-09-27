import assert from "node:assert/strict";
import test from "node:test";

import {
  HOME_DESKTOP_PATH,
  createHomeContributions,
  openHomeOnDesktopStart,
} from "../src/desktop/contract.ts";

test("Home registers as a Desktop page and opens once per app start", () => {
  const render = () => null;
  const contributions = createHomeContributions(render);

  assert.deepEqual(
    contributions.map(({ area, data, order }) => ({
      area,
      data: area === "palette" ? { id: data.id, label: data.label } : data,
      order,
    })),
    [
      { area: "routes", data: { path: HOME_DESKTOP_PATH }, order: -1000 },
      {
        area: "sidebar.nav",
        data: { path: HOME_DESKTOP_PATH, label: "Home", codicon: "home" },
        order: -1000,
      },
      {
        area: "palette",
        data: { id: "home.open", label: "Open Home" },
        order: -1000,
      },
    ],
  );

  const storage = new Map();
  const navigations = [];
  const state = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };

  assert.equal(openHomeOnDesktopStart(state, (path) => navigations.push(path)), true);
  assert.equal(openHomeOnDesktopStart(state, (path) => navigations.push(path)), false);
  assert.deepEqual(navigations, [HOME_DESKTOP_PATH]);
});

test("Home never hijacks HUD, pop-out session or browser windows", () => {
  // Each Desktop window is its own renderer with its own sessionStorage. The
  // HUD (?win=hud) only renders the chat routes, so navigating it to /home
  // replaced the chat with a clipped Home page and dropped the session route.
  for (const search of [
    "?win=hud&profile=default",
    "?win=secondary",
    "?win=browser&tab=t1",
  ]) {
    const storage = new Map();
    const navigations = [];
    const state = {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    };

    assert.equal(
      openHomeOnDesktopStart(state, (path) => navigations.push(path), search),
      false,
      search,
    );
    assert.deepEqual(navigations, [], search);
  }

  const storage = new Map();
  const navigations = [];
  const state = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };
  assert.equal(openHomeOnDesktopStart(state, (path) => navigations.push(path), ""), true);
  assert.deepEqual(navigations, [HOME_DESKTOP_PATH]);
});
