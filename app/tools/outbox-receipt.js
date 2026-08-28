"use strict";

const { readFileSync } = require("node:fs");

const USAGE =
  "usage: node app/tools/outbox-receipt.js <state-file> <approval-id>\n";
const CANNOT_READ = "outbox-receipt: cannot read state file\n";
const NOT_JSON = "outbox-receipt: state file is not valid JSON\n";
const INVALID_STATE = "outbox-receipt: invalid Relay state\n";
const NOT_FOUND = "outbox-receipt: outbox receipt not found\n";
const COLLECTIONS = ["events", "jobs", "approvals", "outbox"];

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(record, key) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isNonEmptyOwnString(record, key) {
  return hasOwn(record, key) &&
    typeof record[key] === "string" &&
    record[key].length > 0;
}

function isValidState(state) {
  if (
    !isRecord(state) ||
    !COLLECTIONS.every(
      collection => hasOwn(state, collection) && Array.isArray(state[collection])
    )
  ) {
    return false;
  }

  const approvalIds = new Set();
  for (const receipt of state.outbox) {
    if (
      !isRecord(receipt) ||
      !isNonEmptyOwnString(receipt, "approvalId") ||
      !isNonEmptyOwnString(receipt, "sentAt") ||
      approvalIds.has(receipt.approvalId)
    ) {
      return false;
    }
    approvalIds.add(receipt.approvalId);
  }

  return true;
}

function fail(message, exitCode) {
  process.stderr.write(message);
  return exitCode;
}

function main(args) {
  if (args.length !== 2) {
    return fail(USAGE, 2);
  }

  let contents;
  try {
    contents = readFileSync(args[0], "utf8");
  } catch {
    return fail(CANNOT_READ, 1);
  }

  let state;
  try {
    state = JSON.parse(contents);
  } catch {
    return fail(NOT_JSON, 1);
  }

  if (!isValidState(state)) {
    return fail(INVALID_STATE, 1);
  }

  const receipt = state.outbox.find(entry => entry.approvalId === args[1]);
  if (receipt === undefined) {
    return fail(NOT_FOUND, 1);
  }

  process.stdout.write(`${JSON.stringify({
    approvalId: receipt.approvalId,
    sentAt: receipt.sentAt,
  })}\n`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
