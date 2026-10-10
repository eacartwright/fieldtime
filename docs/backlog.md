# fieldtime — Backlog

Observations, requested changes and ideas from using the app. They're a record, not a
commitment: an item is built only when Evan picks it. New items go in **Inbox** first, then get
sorted into Next / Soon / Later by when they'd make sense. Milestones (M1.5, M5, M6…) are the ones in
[DESIGN.md §12](../DESIGN.md#12-milestones). When an item is done, delete it here and note it
under Status in [CLAUDE.md](../CLAUDE.md).

## Inbox

- **Billing default per work type (M5 step 3 / M6).** Each work type carries a default
  Billing value (Billable / Non-billable / No Charge); a new session's Billing comes from its
  work type. Travel is always Non-billable. CW does this today but unreliably. **Waiting on
  Evan** for the value of each work type; the profile JSON will hold them until M6 syncs work
  types from CW.
- **Edit the profile in the app (later).** Fields, lists and the entry format from Settings,
  instead of editing the profile JSON in the repo.

Items marked **(?)** need a word from Evan on what was meant before building.

## Next — small, from daily use

- **Mark done closes Task details.** Today "Mark done" sets the status and leaves the dialog
  open (`TaskDetail.tsx`).
- **Titles as real text, not a ghost.** When a task has no title, the first line of the notes
  shows as placeholder text in the Title field (`titleDerived`). Fill the field with that
  text instead, so it can be edited directly (Task details and the Now card).
- **Archived is too hard to find.** The task list has Recent / Today / Inbox / Done and no
  way to see archived tasks. Add an Archived view, or show them under Done.
- **Change the start time of a running task from the Now card.** The session editor already
  handles a running session (start editable, end shows "running"), but only from Task details.
  Give the running card a direct way to adjust its start ("started 10 min ago" fixes).
- **Room for vertical scrollbars.** Scrolling panels (desktop) shift or clip content when a
  scrollbar appears. Reserve the gutter (`scrollbar-gutter: stable`) on the scroll areas.
- **Inbox title starts lowercase on mobile.** The + Inbox title field (`InboxAdd.tsx`) doesn't
  capitalize the first letter on the iPhone. Add `autoCapitalize="sentences"`.
- **Any day, not just "Today".** The task list's Today view should be able to show the tasks
  worked on yesterday, last Sunday, any date: a date picker with ◀ ▶, like By day in Time
  entries. Overlaps with the Day report (DESIGN.md §7, Surfaces 6) and the M1.5 Day calendar.
- **Ticket # wherever a task is edited.** Until finding tickets in fieldtime works well (the
  ticket search window below, mostly a layout question), the workflow is: find the ticket in CW
  by hand, paste its number into the task. Every task already has the field (`task.ref`), and
  pasting it already looks the ticket up, but it only appears in Task details and Time
  entries. Add it to the running Now card and the + Inbox dialog, so it can be pasted while
  working or when capturing.

## Soon — with M5–M8 (projects & profiles, then CW)

- **"WRIT" quick button (M6).** One tap to put a task on the catch-all ticket(s) instead of
  looking up a ticket number. Needs the catch-all ticket number(s) stored in Settings.
- **Travel quick buttons (M6).** One tap to add a travel session / set the travel work type.
  Pin down: does it add a separate session, and with which work type(s) and default length?
- **Billing field (M5).** Billable / Non-billable / No Charge per session, defaulting from the
  work type. A CW profile `choice` field (DESIGN.md §4), not core; M8 maps it onto CW's billing
  options when pushing.
- **Bulk push (M8).** Push all of a task's (or a day's) unentered sessions to CW at once from
  Time entries, rather than one by one.
- **Ticket search window (M6, larger).** A dense results window for finding the right ticket:
  search all open tickets at minimum, and closed ones too, since the work may belong to a
  closed ticket. Results offer **Track** (DESIGN.md §10, Tracked vs. findable). Ties in with
  §10 "suggest likely existing tickets". On desktop this may mean a more information-dense
  layout overall; design it before building.
- **Track a CW project (M7).** Search CW projects, track one, pick which of its tickets to
  track, with the template tickets (Project Coordination, Client Communication, In-house
  Preparation) preselected by name from the profile.
- **Sidebar (M7).** Now, Inbox, Projects, Tasks, then profile/integration views (Clients, CW
  Tickets, CW Projects). DESIGN.md §7, Surfaces 4.

## Later

- **Native apps (M3 and "later").** What it would take to make proper Android, iOS and
  Windows apps, with native gestures such as swipe-out menus. Windows is M3 (Tauri); write up
  the options (Tauri mobile, Capacitor, React Native) before committing.
- **Rename the app to sideshow** (chosen 2026-10-10, replacing "juggle" from 2026-10-08).
  "fieldtime" no longer fits: the work isn't only field work, and the app is turning into task
  management first, with time entry beside it. A sideshow is the secondary production beside the
  circus's main show: the company's tools are the main show, and sideshow is my own space beside
  them (DESIGN.md §1). Written **lowercase everywhere** ("sideshow", like "fieldtime" today: the
  app header, the UI, docs, `@sideshow/*`, `sideshow.evans.tools`), except a few title spots
  such as the `# Sideshow` heading of the GitHub README. The rename touches ~150 mentions: package names (`@fieldtime/*`), the UI, the scripts
  and scheduled task, `C:\Apps\fieldtime`, the database file, the backup folder and file names,
  the `fieldtime.evans.tools` hostname and its Cloudflare Access app, and the iPhone home-screen
  app (re-add it after). Do it in one pass, before M3 adds more places. Keep it out of CW
  as before.
