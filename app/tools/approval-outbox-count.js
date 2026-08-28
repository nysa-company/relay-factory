const fs = require("node:fs");

const USAGE =
  "usage: node app/tools/approval-outbox-count.js <state-file> <approval-id>\n";
const CANNOT_READ = "approval-outbox-count: cannot read state file\n";
const NOT_JSON = "approval-outbox-count: state file is not valid JSON\n";
const INVALID_STATE = "approval-outbox-count: invalid Relay state\n";
const NO_SUCH_APPROVAL = "approval-outbox-count: no such approval\n";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(record, property) {
  return Object.prototype.hasOwnProperty.call(record, property);
}

function validatedApprovalIds(state) {
  if (!isRecord(state)) {
    return null;
  }

  for (const collection of ["events", "jobs", "approvals", "outbox"]) {
    if (!hasOwn(state, collection) || !Array.isArray(state[collection])) {
      return null;
    }
  }

  const approvalIds = new Set();
  for (const approval of state.approvals) {
    if (
      !isRecord(approval) ||
      !hasOwn(approval, "id") ||
      typeof approval.id !== "string" ||
      approval.id.length === 0 ||
      approvalIds.has(approval.id)
    ) {
      return null;
    }
    approvalIds.add(approval.id);
  }

  for (const entry of state.outbox) {
    if (
      !isRecord(entry) ||
      !hasOwn(entry, "approvalId") ||
      typeof entry.approvalId !== "string" ||
      entry.approvalId.length === 0 ||
      !approvalIds.has(entry.approvalId)
    ) {
      return null;
    }
  }

  return approvalIds;
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

  const approvalIds = validatedApprovalIds(state);
  if (approvalIds === null) {
    process.stderr.write(INVALID_STATE);
    return 1;
  }

  const approvalId = args[1];
  if (!approvalIds.has(approvalId)) {
    process.stderr.write(NO_SUCH_APPROVAL);
    return 1;
  }

  const outboxEntries = state.outbox.reduce(
    (count, entry) => count + (entry.approvalId === approvalId ? 1 : 0),
    0,
  );
  process.stdout.write(`${JSON.stringify({ approvalId, outboxEntries })}\n`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
