"use strict";

const { isAddress } = require("./chain-read.js");

const BITQUERY_ENDPOINT = "https://streaming.bitquery.io/graphql";
const PONS_V2_FACTORY = "0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e";

/**
 * Build the GraphQL query body that asks Bitquery for every `TokenLaunched`
 * event on the Pons v2 factory naming `address` as the given argument
 * ("deployer" or "token"). Pure and tested: given the same inputs it
 * produces the same query string every time, with no network involved.
 *
 * `dataset` defaults to "realtime" because the free tier this project was
 * built against rejects "combined"/"archive" with an explicit error -- see
 * SPEC.md and STATUS.md M0 for how that was discovered.
 */
function buildLaunchQuery(argumentName, address, { limit = 50, dataset = "realtime" } = {}) {
  if (argumentName !== "deployer" && argumentName !== "token") {
    throw new Error(`argumentName must be "deployer" or "token", got ${JSON.stringify(argumentName)}`);
  }
  if (!isAddress(address)) {
    throw new Error(`not a valid address: ${address}`);
  }
  const query =
    `{ EVM(network: robinhood, dataset: ${dataset}) { Events(` +
    `where: {LogHeader: {Address: {is: "${PONS_V2_FACTORY}"}}, ` +
    `Log: {Signature: {Name: {is: "TokenLaunched"}}}, ` +
    `Arguments: {includes: {Name: {is: "${argumentName}"}, Value: {Address: {is: "${address.toLowerCase()}"}}}}}, ` +
    `limit: {count: ${limit}}) { Block { Time Number } Transaction { Hash } ` +
    `Arguments { Name Value { ... on EVM_ABI_Address_Value_Arg { address } } } } } }`;
  return { query };
}

/** Flatten Bitquery's Arguments array into a plain {name: address} object for one event. */
function flattenArguments(event) {
  const out = {};
  for (const arg of event.Arguments || []) {
    out[arg.Name] = arg.Value && arg.Value.address ? arg.Value.address : null;
  }
  return out;
}

/**
 * POST a query to Bitquery with the given API key. Not unit-tested directly
 * (it's a thin network call) -- buildLaunchQuery and flattenArguments carry
 * the logic worth testing without a live connection.
 */
async function runQuery(query, apiKey) {
  const res = await fetch(BITQUERY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  if (json.errors) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  return json.data.EVM.Events;
}

module.exports = { PONS_V2_FACTORY, BITQUERY_ENDPOINT, buildLaunchQuery, flattenArguments, runQuery };
