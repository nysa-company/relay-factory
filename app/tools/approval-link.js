const fs = require("node:fs");

const USAGE = "usage: node app/tools/approval-link.js <state-file> <approval-id>\n";
const CANNOT_READ = "approval-link: cannot read state file\n";
const NOT_JSON = "approval-link: state file is not valid JSON\n";
const INVALID_STATE = "approval-link: invalid Relay state\n";
const NO_SUCH_APPROVAL = "approval-link: no such approval\n";
const APPROVAL_STATUSES = new Set([
  "pending",
  "sent",
  "rejected",
  "blocked_recipient",
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(record, property) {
  return Object.prototype.hasOwnProperty.call(record, property);
}

function validatedJobs(state) {
  const jobsById = new Map();

  for (const job of state.jobs) {
    if (
      !isRecord(job) ||
      !hasOwn(job, "id") ||
      typeof job.id !== "string" ||
      job.id.length === 0 ||
      !hasOwn(job, "eventId") ||
      typeof job.eventId !== "string" ||
      job.eventId.length === 0 ||
      jobsById.has(job.id)
    ) {
      return null;
    }
    jobsById.set(job.id, job);
  }

  return jobsById;
}

function isValidState(state) {
  if (!isRecord(state)) {
    return null;
  }

  for (const collection of ["events", "jobs", "approvals", "outbox"]) {
    if (!hasOwn(state, collection) || !Array.isArray(state[collection])) {
      return null;
    }
  }

  const jobsById = validatedJobs(state);
  if (jobsById === null) {
    return null;
  }

  const approvalIds = new Set();
  for (const approval of state.approvals) {
    if (
      !isRecord(approval) ||
      !hasOwn(approval, "id") ||
      typeof approval.id !== "string" ||
      approval.id.length === 0 ||
      !hasOwn(approval, "jobId") ||
      typeof approval.jobId !== "string" ||
      approval.jobId.length === 0 ||
      !hasOwn(approval, "status") ||
      typeof approval.status !== "string" ||
      !APPROVAL_STATUSES.has(approval.status) ||
      approvalIds.has(approval.id) ||
      !jobsById.has(approval.jobId)
    ) {
      return null;
    }
    approvalIds.add(approval.id);
  }

  return jobsById;
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

  const jobsById = isValidState(state);
  if (jobsById === null) {
    process.stderr.write(INVALID_STATE);
    return 1;
  }

  const approval = state.approvals.find(entry => entry.id === args[1]);
  if (approval === undefined) {
    process.stderr.write(NO_SUCH_APPROVAL);
    return 1;
  }

  const job = jobsById.get(approval.jobId);
  process.stdout.write(`${JSON.stringify({
    approvalId: approval.id,
    eventId: job.eventId,
    status: approval.status,
  })}\n`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
