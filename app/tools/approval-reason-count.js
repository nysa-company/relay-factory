const { readFileSync } = require("node:fs");

const USAGE = "usage: node app/tools/approval-reason-count.js <state-file>\n";
const CANNOT_READ = "approval-reason-count: cannot read state file\n";
const NOT_JSON = "approval-reason-count: state file is not valid JSON\n";
const INVALID_STATE = "approval-reason-count: invalid Relay state\n";
const APPROVAL_STATUSES = new Set([
  "pending",
  "sent",
  "rejected",
  "blocked_recipient",
]);

function hasOwn(value, property) {
  return Object.prototype.hasOwnProperty.call(value, property);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyStringProperty(value, property) {
  return hasOwn(value, property) &&
    typeof value[property] === "string" &&
    value[property].length > 0;
}

function isValidState(state) {
  if (!isObject(state)) {
    return false;
  }

  for (const collection of ["events", "jobs", "approvals", "outbox"]) {
    if (!hasOwn(state, collection) || !Array.isArray(state[collection])) {
      return false;
    }
  }

  const approvalIds = new Set();
  for (const approval of state.approvals) {
    if (
      !isObject(approval) ||
      !isNonEmptyStringProperty(approval, "id") ||
      !isNonEmptyStringProperty(approval, "jobId") ||
      !isNonEmptyStringProperty(approval, "proposedAt") ||
      !hasOwn(approval, "status") ||
      !APPROVAL_STATUSES.has(approval.status) ||
      !hasOwn(approval, "action") ||
      !isObject(approval.action) ||
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

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    process.stderr.write(USAGE);
    process.exitCode = 2;
    return;
  }

  let contents;
  try {
    contents = readFileSync(args[0], "utf8");
  } catch {
    process.stderr.write(CANNOT_READ);
    process.exitCode = 1;
    return;
  }

  let state;
  try {
    state = JSON.parse(contents);
  } catch {
    process.stderr.write(NOT_JSON);
    process.exitCode = 1;
    return;
  }

  if (!isValidState(state)) {
    process.stderr.write(INVALID_STATE);
    process.exitCode = 1;
    return;
  }

  const approvalsWithReasons = state.approvals.filter(
    approval =>
      hasOwn(approval, "reason") &&
      typeof approval.reason === "string" &&
      approval.reason.length > 0
  ).length;
  process.stdout.write(`${JSON.stringify({ approvalsWithReasons })}\n`);
}

main();
