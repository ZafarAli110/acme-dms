---
name: check-in-browser
description: Drives the running web app in a browser with playwright-cli, to check a change the way a user sees it (a form, a list, a field error, French labels). Use when verifying a web change, or when the verifier needs to see the page.
---

# Check the web app in a browser

`bunx playwright-cli` drives the installed Chrome (`.playwright/cli.config.json`; nothing to download). Its commands
are in `bunx playwright-cli --help`; read that first.

1. The web app's URL: `bun run status` (the `web` resource). The system must already be running.
2. `bunx playwright-cli open <web url>/sign-in`, then sign in as the demo user the ticket is about (the form is
   pre-filled with sam; the demo users and their locations are in the README). Use `snapshot` to see the page and
   the element references to `click` and `fill`.
3. Check what the ticket asks, as the user it is for. Anything per location: switch location in the top bar and
   check again.
4. **Look at every screen the change adds or alters**, as a person would: tests check behaviour, not how it looks.
   `resize 1440 900`, `screenshot`; then `resize 1024 768` (the advisors' tablets), `screenshot` again; for a list or
   a form with many fields, scroll and screenshot the rest. Open each PNG with `Read` and say what you see. Look for
   anything overlapping or spilling out of its box (icons, chips, buttons), text cut off, a control out of reach,
   columns out of line, an empty state that says nothing. If the ticket gives a design, or a prototype was picked,
   open it beside the screenshot and name every difference. A layout problem is a failure, not a note.
5. **Change only what you created.** Name new records `e2e-…`; never edit seeded customers, parts or stock, which
   the checks and the other tickets rely on.
6. Close the browser when you are done (`bunx playwright-cli close`).

Report what you saw with the command that showed it, as the `verify-ticket` skill asks. A behaviour worth keeping
becomes a Playwright test in `web/e2e/` (`bun run gate:slow`).
