// Dev CLI for poking at the ConnectWise API. Run from the repo root:
//   npm run cw -- <command>
//
//   companies [--all]                    active companies (or every status), by name
//   diag                                 company counts by status and type
//   dupes                                company names with more than one record
//   tickets <text>                       open tickets whose summary contains <text>
//   note <ticketId> [--text "..."] [--discussion] [--yes]
//                                        add a test note (Internal, no notifications, asks first)
//
// Credentials come from .env at the repo root (see .env.example).

import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { ConnectWiseClient, configFromEnv, type CwCompany } from "./client";

const COMMANDS = ["companies", "diag", "dupes", "tickets", "note"];

const typeNames = (c: CwCompany) => c.types?.map((t) => t.name ?? "?").join(", ") || "n/a";

function countBy(items: Iterable<string>) {
  const m = new Map<string, number>();
  for (const k of items) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]);
}

function printCounts(rows: [string, number][]) {
  for (const [k, n] of rows) console.log(`  ${k}: ${n}`);
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      all: { type: "boolean" },
      text: { type: "string" },
      discussion: { type: "boolean" },
      yes: { type: "boolean" },
    },
  });
  const [command, arg] = positionals;
  if (!command || !COMMANDS.includes(command)) {
    console.log(`commands: ${COMMANDS.join(" | ")}  (see the top of cli.ts)`);
    process.exitCode = command ? 1 : 0;
    return;
  }
  const cw = new ConnectWiseClient(configFromEnv());

  switch (command) {
    case "companies": {
      const companies = values.all ? await cw.getAllCompanies() : await cw.getActiveCompanies();
      companies.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
      console.log(`${companies.length} ${values.all ? "" : "active "}companies:\n`);
      for (const c of companies) console.log(`  [${c.id}] ${c.name}  (types: ${typeNames(c)})`);
      return;
    }

    case "diag": {
      // Why doesn't the API count match the CW grid? Usually the grid filters by type too.
      const all = await cw.getAllCompanies();
      console.log(`All companies: ${all.length}\n\nBy status:`);
      printCounts(countBy(all.map((c) => c.status?.name ?? "(no status)")));

      const types = (cs: CwCompany[]) =>
        countBy(cs.flatMap((c) => (c.types?.length ? c.types.map((t) => t.name ?? "?") : ["(no type)"])));
      console.log("\nBy type (a company can have several):");
      printCounts(types(all));

      const active = all.filter((c) => c.status?.name === "Active");
      console.log(`\nActive: ${active.length}, by type:`);
      printCounts(types(active));
      const clients = active.filter((c) => c.types?.some((t) => t.name === "Client" || t.name === "Customer"));
      console.log(`\nActive and type Client or Customer: ${clients.length}`);
      return;
    }

    case "dupes": {
      const byName = new Map<string, CwCompany[]>();
      for (const c of await cw.getAllCompanies()) {
        const key = c.name.trim().toLowerCase();
        byName.set(key, [...(byName.get(key) ?? []), c]);
      }
      const dupes = [...byName.values()]
        .filter((cs) => cs.length > 1)
        .sort((a, b) => a[0]!.name.localeCompare(b[0]!.name));
      console.log(`${dupes.length} company names with more than one record:\n`);
      for (const cs of dupes) {
        console.log(`'${cs[0]!.name}' - ${cs.length} records:`);
        for (const c of cs) {
          console.log(
            `    id=${c.id}  identifier=${c.identifier}  status=${c.status?.name ?? "n/a"}  ` +
              `types=${typeNames(c)}  location=${c.city ?? ""}, ${c.state ?? ""}  phone=${c.phoneNumber || "n/a"}`,
          );
        }
        console.log();
      }
      return;
    }

    case "tickets": {
      if (!arg) throw new Error("usage: tickets <text>");
      const tickets = await cw.findTickets(`summary like "%${arg}%" and closedFlag=false`);
      console.log(`${tickets.length} open ticket(s) matching '${arg}':`);
      for (const t of tickets) {
        console.log(`  #${t.id}  ${t.summary}  (${t.company?.name} / ${t.board?.name})`);
      }
      return;
    }

    case "note": {
      const ticketId = Number(arg);
      if (!Number.isInteger(ticketId)) throw new Error("usage: note <ticketId> [--text ...] [--discussion] [--yes]");
      const t = await cw.getTicket(ticketId);
      console.log(`Ticket #${t.id}: ${t.summary}`);
      console.log(`  company: [${t.company?.id}] ${t.company?.name}`);
      console.log(`  board:   ${t.board?.name}   status: ${t.status?.name}`);
      const notes = await cw.getTicketNotes(ticketId);
      console.log(`  existing notes: ${notes.length}`);
      for (const n of notes.slice(-3)) {
        console.log(`    - (${n.internalAnalysisFlag ? "internal" : "discussion"}) ${JSON.stringify(n.text.slice(0, 80))}`);
      }

      const text = values.text ?? `API test note at ${new Date().toLocaleString()}`;
      const where = values.discussion ? "Discussion" : "Internal Analysis";
      console.log(`\nWill add to ${where}: ${JSON.stringify(text)}`);
      if (!values.yes) {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const answer = await rl.question("Proceed? [y/N] ");
        rl.close();
        if (answer.trim().toLowerCase() !== "y") return console.log("Aborted.");
      }
      const note = await cw.addTicketNote(ticketId, text, { internal: !values.discussion });
      console.log(`Created note id=${note.id} on ticket #${ticketId}`);
      return;
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
