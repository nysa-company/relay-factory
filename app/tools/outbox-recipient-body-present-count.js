"use strict";

const { readFileSync } = require("node:fs");

const COLLECTIONS = ["events", "jobs", "approvals", "outbox"];

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(record, key) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function hasNonEmptyString(record, key) {
  return hasOwn(record, key) && typeof record[key] === "string" && record[key].length > 0;
}

function isValidState(state) {
  if (
    !isRecord(state) ||
    !COLLECTIONS.every(
      (collection) => hasOwn(state, collection) && Array.isArray(state[collection]),
    )
  ) {
    return false;
  }

  const approvalIds = new Set();
  for (const receipt of state.outbox) {
    if (
      !isRecord(receipt) ||
      !hasOwn(receipt, "to") ||
      !hasOwn(receipt, "subject") ||
      !hasOwn(receipt, "body") ||
      !hasNonEmptyString(receipt, "approvalId") ||
      !hasNonEmptyString(receipt, "sentAt") ||
      approvalIds.has(receipt.approvalId)
    ) {
      return false;
    }
    approvalIds.add(receipt.approvalId);
  }

  return true;
}

function main(args) {
  if (args.length !== 2) {
    process.stderr.write(
      "usage: node app/tools/outbox-recipient-body-present-count.js <state-file> <recipient>\n",
    );
    return 2;
  }

  let contents;
  try {
    contents = readFileSync(args[0], "utf8");
  } catch {
    process.stderr.write("outbox-recipient-body-present-count: cannot read state file\n");
    return 1;
  }

  let state;
  try {
    state = JSON.parse(contents);
  } catch {
    process.stderr.write("outbox-recipient-body-present-count: state file is not valid JSON\n");
    return 1;
  }

  if (!isValidState(state)) {
    process.stderr.write("outbox-recipient-body-present-count: invalid Relay state\n");
    return 1;
  }

  const outboxEntriesWithRecipientAndTextBody = state.outbox.filter(
    (receipt) => receipt.to === args[1] && typeof receipt.body === "string" && receipt.body.length > 0,
  ).length;
  process.stdout.write(`${JSON.stringify({ outboxEntriesWithRecipientAndTextBody })}\n`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
