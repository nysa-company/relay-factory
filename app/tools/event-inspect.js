const { readFileSync } = require("node:fs");

const COLLECTIONS = ["events", "jobs", "approvals", "outbox"];

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyOwnString(record, key) {
  return Object.hasOwn(record, key) && typeof record[key] === "string" && record[key].length > 0;
}

function isValidState(state) {
  if (
    !isRecord(state) ||
    !COLLECTIONS.every((collection) => Object.hasOwn(state, collection) && Array.isArray(state[collection]))
  ) {
    return false;
  }

  const eventIds = new Set();
  for (const event of state.events) {
    if (
      !isRecord(event) ||
      !isNonEmptyOwnString(event, "id") ||
      !isNonEmptyOwnString(event, "type") ||
      !isNonEmptyOwnString(event, "receivedAt") ||
      eventIds.has(event.id)
    ) {
      return false;
    }
    eventIds.add(event.id);
  }

  return state.jobs.every(
    (job) => isRecord(job) && isNonEmptyOwnString(job, "eventId"),
  );
}

function main(args) {
  if (args.length !== 2) {
    process.stderr.write("usage: node app/tools/event-inspect.js <state-file> <event-id>\n");
    return 2;
  }

  let bytes;
  try {
    bytes = readFileSync(args[0], "utf8");
  } catch {
    process.stderr.write("event-inspect: cannot read state file\n");
    return 1;
  }

  let state;
  try {
    state = JSON.parse(bytes);
  } catch {
    process.stderr.write("event-inspect: state file is not valid JSON\n");
    return 1;
  }

  if (!isValidState(state)) {
    process.stderr.write("event-inspect: invalid Relay state\n");
    return 1;
  }

  const event = state.events.find((candidate) => candidate.id === args[1]);
  if (event === undefined) {
    process.stderr.write("event-inspect: event not found\n");
    return 1;
  }

  const result = {
    id: event.id,
    type: event.type,
    receivedAt: event.receivedAt,
    hasJob: state.jobs.some((job) => job.eventId === event.id),
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
