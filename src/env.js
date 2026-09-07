"use strict";

/**
 * A tiny .env parser -- deliberately not the `dotenv` package, to keep this
 * repository's dependency count honest at zero. Handles exactly what
 * thread's own .env.example needs: KEY=value lines, blank lines, and
 * '#' comments. Not a general-purpose implementation (no quoting rules,
 * no multiline values, no variable expansion) -- if the project ever needs
 * more than that, reach for a real library instead of growing this one.
 */
function parseEnv(text) {
  const out = {};
  if (typeof text !== "string") return out;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

module.exports = { parseEnv };
