"use strict";

// Guards the audio-cleanup hand-off (#583): a track too damaged to clean is not
// "fixed" here — it is handed to source media health for replacement, per
// docs/audio-cleanup-controls.md ("flag when a track is too damaged to clean and
// should be replaced in docs/source-media-health.md").
// Run with: `node prototype/audio-cleanup-controls-fix-routing.test.js`

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const dir = __dirname;
const html = fs.readFileSync(path.join(dir, "audio-cleanup-controls.html"), "utf8");

// "too damaged" is a real, selectable track state.
assert.ok(
  html.includes('"not needed", "too damaged"'),
  "track status offers a 'too damaged' state",
);

// A too-damaged track renders a navigable hand-off to the screen that owns source media.
assert.ok(
  html.includes('fixLink = document.createElement("a")'),
  "too-damaged tracks render an anchor hand-off, not a dead end",
);
assert.ok(
  html.includes('fixLink.href = "source-media-health.html"'),
  "too-damaged tracks route to source media health",
);
assert.ok(
  fs.existsSync(path.join(dir, "source-media-health.html")),
  "fix screen exists: source-media-health.html",
);

console.log("audio cleanup controls: too-damaged tracks hand off to source media health");
