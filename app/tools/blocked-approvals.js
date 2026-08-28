const fs = require("node:fs");

const USAGE = "usage: node app/tools/blocked-approvals.js <state-file>\n";
const CANNOT_READ = "blocked-approvals: cannot read state file\n";
const NOT_JSON = "blocked-approvals: state file is not valid JSON\n";
const INVALID_STATE = "blocked-approvals: invalid Relay state\n";
const APPROVAL_STATUSES = new Set([
  "pending",
  "sent",
  "rejected",
  "blocked_recipient",
]);

function isValidState(state) {
  if (state === null || typeof state !== "object" || Array.isArray(state)) {
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

  const structurallyValid = state.approvals.every(approval =>
    approval !== null &&
    typeof approval === "object" &&
    !Array.isArray(approval) &&
    typeof approval.id === "string" &&
    approval.id.length > 0 &&
    typeof approval.jobId === "string" &&
    approval.jobId.length > 0 &&
    typeof approval.proposedAt === "string" &&
    approval.proposedAt.length > 0 &&
    typeof approval.status === "string" &&
    APPROVAL_STATUSES.has(approval.status)
  );

  if (!structurallyValid) {
    return false;
  }

  const seenIds = new Set();
  for (const approval of state.approvals) {
    if (seenIds.has(approval.id)) {
      return false;
    }
    seenIds.add(approval.id);
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
    contents = fs.readFileSync(args[0], "utf8");
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

  const blocked = state.approvals
    .filter(approval => approval.status === "blocked_recipient")
    .map(({ id, jobId, proposedAt }) => ({ id, jobId, proposedAt }))
    .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);

  process.stdout.write(`${JSON.stringify(blocked)}\n`);
}

main();
