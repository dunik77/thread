"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

test("the Worker permanently redirects HTTP to the same URL over HTTPS", async () => {
  const { default: worker } = await import("../worker.mjs");
  const response = await worker.fetch(
    new Request("http://thread-pons.com/path?q=1"),
    { ASSETS: { fetch: () => { throw new Error("assets should not be called"); } } },
  );

  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "https://thread-pons.com/path?q=1");
});

test("the Worker serves HTTPS requests from static assets", async () => {
  const { default: worker } = await import("../worker.mjs");
  const expected = new Response("site");
  const response = await worker.fetch(
    new Request("https://thread-pons.com/"),
    { ASSETS: { fetch: () => expected } },
  );

  assert.equal(response, expected);
});
