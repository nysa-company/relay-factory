const fs = require("node:fs");

const USAGE = "usage: node app/tools/outbox-inspect.js <state-file> <approval-id>\n";
const CANNOT_READ = "outbox-inspect: cannot read state file\n";
const NOT_JSON = "outbox-inspect: state file is not valid JSON\n";
const INVALID_STATE = "outbox-inspect: invalid Relay state\n";
const NOT_FOUND = "outbox-inspect: outbox receipt not found\n";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidState(state) {
  if (!isRecord(state)) {
    return false;
  }

  for (const collection of ["events", "jobs", "approvals", "outbox"]) {
    if (!Object.hasOwn(state, collection) || !Array.isArray(state[collection])) {
      return false;
    }
  }

  const approvalIds = new Set();
  for (const receipt of state.outbox) {
    if (
      !isRecord(receipt) ||
      !Object.hasOwn(receipt, "approvalId") ||
      typeof receipt.approvalId !== "string" ||
      receipt.approvalId.length === 0 ||
      !Object.hasOwn(receipt, "sentAt") ||
      typeof receipt.sentAt !== "string" ||
      receipt.sentAt.length === 0 ||
      approvalIds.has(receipt.approvalId)
    ) {
      return false;
    }
    approvalIds.add(receipt.approvalId);
  }

  return true;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
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

  const receipt = state.outbox.find(item => item.approvalId === args[1]);
  if (receipt === undefined) {
    process.stderr.write(NOT_FOUND);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`${JSON.stringify({
    approvalId: receipt.approvalId,
    sentAt: receipt.sentAt,
  })}\n`);
}

main();
