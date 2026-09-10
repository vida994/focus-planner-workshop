# Focus Planner: finished workshop app

This is the completed four-stage app from Antonio's Cursor Split workshop on 11 September 2026. Use it as a reference or as a recovery starting point if you get stuck. The separate workshop starter is the one to use for the guided build.

## Run it

1. Install [Node.js 24 LTS](https://nodejs.org/en/download) and [Cursor](https://cursor.com/download).
2. Extract the ZIP first. On Windows, right-click and choose **Extract All**. On Mac, double-click it. Open the extracted folder in Cursor; `package.json` should be at the top level.
3. Open **Terminal → New Terminal** and run:

```text
npm run dev
```

4. Open **http://127.0.0.1:3000** in your normal browser. Keep the terminal running. No `npm install`, Git setup, database or deployment is needed.

If PowerShell blocks `npm.ps1`, select **Command Prompt** from the terminal dropdown and run the same command. Do not change your system execution policy. If port 3000 is busy, stop your previous workshop server with **Ctrl+C** first.

## Add your own Grok key

Manual tasks, time filters and browser saving work without a key. Grok estimates and goal breakdowns use your own xAI API credits.

1. Sign in to [xAI Console](https://console.x.ai). Use the team where you redeemed your private workshop credit, then create a key under **API Keys**.
2. The workshop download includes a blank `.env`. If you downloaded GitHub's **Code → Download ZIP**, copy `.env.example` to a new file named exactly `.env` (no `.txt`).
3. In Cursor's file editor, paste your key after `XAI_API_KEY=` and save.
4. Stop the server with **Ctrl+C**, then run `npm run dev` again.

Keep your `.env` private. Do not paste a key into an AI chat, screenshot it or upload it. The repository includes only the blank example. Ignore rules reduce accidental indexing but are not an access barrier.

## What is included

- Add, edit, complete, reopen, undo and delete tasks.
- Find individual tasks that fit 5, 10, 15, 30 or 60 minutes, or a custom duration.
- Ask Grok for a task estimate or an editable goal breakdown. Only selected, approved suggestions become tasks.
- Save tasks in your browser, export a JSON backup and restore it with confirmation.

This is a local, single-person workshop app. Estimates are approximate. The server uses Grok 4.6 with low reasoning; the model selected to write code inside Cursor is a separate choice.

## Keep your existing work

Extract this into a **separate folder**. Do not overwrite the project you built. If your old app still opens, export a backup first. Use one running workshop server and one active app tab.

Tasks belong to the browser profile and the address `http://127.0.0.1:3000`, rather than the project folder. Replacing or restoring tasks in either copy affects the saved list at that address. Different browsers have separate lists; use a backup to transfer them. API keys and task backups are not included in this download.

## Continue with Cursor

The four shared stages are already built. Start with this prompt:

```text
Read README.md, SPEC.md and the existing public/ files. This is the finished four-stage workshop app. Summarize what it does and ask what I would like to change. Do not change files, read .env or make any AI calls yet.
```

Then describe one change you want. Check it in the browser and explain any problem using the action you tried, the result you expected and what actually happened.

## Verification

The Mac rehearsal covered the four stages, the review/error fixes, storage conflicts and restoring a real downloaded backup. Packaging preserves those app files unchanged. The prepared server has automated checks with fake replies (`npm test`). Actual Windows rehearsal and exhaustive regression coverage remain unverified as of 10 September 2026.

Requirements are in `SPEC.md`. The participant prompts and installation checklist are supplied on the workshop resource page.
