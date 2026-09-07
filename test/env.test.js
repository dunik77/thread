"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseEnv } = require("../src/env.js");

test("parseEnv reads a simple KEY=value line", () => {
  assert.deepEqual(parseEnv("BITQUERY_API_TOKEN=abc123"), { BITQUERY_API_TOKEN: "abc123" });
});

test("parseEnv skips blank lines and comments", () => {
  const text = "\n# a comment\nFOO=bar\n\n# another\nBAZ=qux\n";
  assert.deepEqual(parseEnv(text), { FOO: "bar", BAZ: "qux" });
});

test("parseEnv strips matching surrounding quotes", () => {
  assert.deepEqual(parseEnv('KEY="quoted value"'), { KEY: "quoted value" });
  assert.deepEqual(parseEnv("KEY='single'"), { KEY: "single" });
});

test("parseEnv ignores lines with no '='", () => {
  assert.deepEqual(parseEnv("not a valid line\nOK=yes"), { OK: "yes" });
});

test("parseEnv handles non-string input safely", () => {
  assert.deepEqual(parseEnv(undefined), {});
  assert.deepEqual(parseEnv(null), {});
});
