"use strict";

const { readFileSync } = require("node:fs");

const COLLECTIONS = ["events", "jobs", "approvals", "outbox"];
const APPROVAL_STATUSES = new Set([
  "pending",
  "sent",
  "rejected",
  "blocked_recipient",
]);

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
  for (const approval of state.approvals) {
    if (
      !isRecord(approval) ||
      !hasNonEmptyString(approval, "id") ||
      !hasNonEmptyString(approval, "jobId") ||
      !hasNonEmptyString(approval, "proposedAt") ||
      !hasOwn(approval, "status") ||
      !APPROVAL_STATUSES.has(approval.status) ||
      !hasOwn(approval, "action") ||
      !isRecord(approval.action) ||
      !hasOwn(approval.action, "to") ||
      !hasOwn(approval.action, "subject") ||
      !hasOwn(approval.action, "body") ||
      (hasOwn(approval, "reason") &&
        approval.reason !== null &&
        typeof approval.reason !== "string") ||
      approvalIds.has(approval.id)
    ) {
      return false;
    }
    approvalIds.add(approval.id);
  }

  return true;
}

function main(args) {
  if (args.length !== 2) {
    process.stderr.write(
      "usage: node app/tools/approval-recipient-count.js <state-file> <recipient>\n",
    );
    return 2;
  }

  let contents;
  try {
    contents = readFileSync(args[0], "utf8");
  } catch {
    process.stderr.write("approval-recipient-count: cannot read state file\n");
    return 1;
  }

  let state;
  try {
    state = JSON.parse(contents);
  } catch {
    process.stderr.write("approval-recipient-count: state file is not valid JSON\n");
    return 1;
  }

  if (!isValidState(state)) {
    process.stderr.write("approval-recipient-count: invalid Relay state\n");
    return 1;
  }

  const approvalsForRecipient = state.approvals.filter(
    (approval) => approval.action.to === args[1],
  ).length;
  process.stdout.write(`${JSON.stringify({ approvalsForRecipient })}\n`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
