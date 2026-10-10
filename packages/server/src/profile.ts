import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  listEntry,
  NO_PROFILE,
  profileProblems,
  slugId,
  type ListItem,
  type Ms,
  type Profile,
  type State,
} from "@fieldtime/shared";

// The active profile (DESIGN.md §4): packages/server/profiles/<PROFILE>.json, chosen with
// PROFILE in .env. Without one, the app is a plain task and time tracker; values already
// stored in fields stay in the database, just hidden.

const DIR = new URL("../profiles/", import.meta.url);

export function loadProfile(name: string | undefined): Profile {
  if (!name) return NO_PROFILE;
  if (!/^[a-z0-9-]+$/i.test(name)) throw new Error(`PROFILE "${name}": use the file name without .json`);
  const file = fileURLToPath(new URL(`${name}.json`, DIR));
  const profile = JSON.parse(readFileSync(file, "utf8")) as Profile;
  const problems = profileProblems(profile);
  if (problems.length) throw new Error(`Profile ${file}: ${problems.join("; ")}`);
  return profile;
}

/**
 * List items to write so the database matches the profile's lists: a list that has no items
 * yet is filled from the profile, and an item's defaults follow the profile entry of the same
 * name (until an integration supplies them instead).
 */
export function profileListChanges(profile: Profile, state: State, now: Ms): ListItem[] {
  const out: ListItem[] = [];
  const items = Object.values(state.lists);
  for (const [list, entries] of Object.entries(profile.lists ?? {})) {
    const existing = items.filter((x) => x.list === list);
    entries.map(listEntry).forEach(({ name, defaults }, position) => {
      if (existing.length === 0) {
        out.push({ id: slugId(name), list, name, position, archived: false, defaults: defaults ?? null, createdAt: now, updatedAt: now, rev: 0 });
        return;
      }
      const item = existing.find((x) => x.name.trim().toLowerCase() === name.trim().toLowerCase());
      if (item && defaults && JSON.stringify(item.defaults ?? null) !== JSON.stringify(defaults)) {
        out.push({ ...item, defaults, updatedAt: now });
      }
    });
  }
  return out;
}
