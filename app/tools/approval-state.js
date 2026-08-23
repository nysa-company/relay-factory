const fs = require("node:fs");

const USAGE = "usage: node app/tools/approval-state.js <state-file> <approval-id>\n";
const CANNOT_READ = "approval-state: cannot read state file\n";
const NOT_JSON = "approval-state: state file is not valid JSON\n";
const INVALID_STATE = "approval-state: invalid Relay state\n";
const NO_SUCH_APPROVAL = "approval-state: no such approval\n";
const APPROVAL_STATUSES = new Set([
  "pending",
  "sent",
  "rejected",
  "blocked_recipient",
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidState(state) {
  if (!isRecord(state)) {
    return false;
  }

  for (const collection of ["events", "jobs", "approvals", "outbox"]) {
    if (
      !Object.prototype.hasOwnProperty.call(state, collection) ||
      !Array.isArray(state[collection])
    ) {
      return false;
    }
  }

  const approvalIds = new Set();
  for (const approval of state.approvals) {
    if (
      !isRecord(approval) ||
      typeof approval.id !== "string" ||
      approval.id.length === 0 ||
      typeof approval.jobId !== "string" ||
      approval.jobId.length === 0 ||
      typeof approval.status !== "string" ||
      !APPROVAL_STATUSES.has(approval.status) ||
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
    process.stderr.write(USAGE);
    return 2;
  }

  let contents;
  try {
    const stats = fs.statSync(args[0]);
    if (!stats.isFile()) {
      throw new Error("not a regular file");
    }
    contents = fs.readFileSync(args[0], "utf8");
  } catch {
    process.stderr.write(CANNOT_READ);
    return 1;
  }

  let state;
  try {
    state = JSON.parse(contents);
  } catch {
    process.stderr.write(NOT_JSON);
    return 1;
  }

  if (!isValidState(state)) {
    process.stderr.write(INVALID_STATE);
    return 1;
  }

  const approval = state.approvals.find(entry => entry.id === args[1]);
  if (approval === undefined) {
    process.stderr.write(NO_SUCH_APPROVAL);
    return 1;
  }

  process.stdout.write(`${JSON.stringify({
    approvalId: approval.id,
    jobId: approval.jobId,
    status: approval.status,
  })}\n`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
