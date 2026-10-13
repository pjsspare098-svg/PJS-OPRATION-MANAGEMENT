# PJS Operations — Open Website + Start Office Agents

**How it works:** The website itself cannot launch Python programs on your Windows PC.
For security, use the one-time Windows **desktop shortcut** installation. Every
time you open PJS Operations through this shortcut, it:

1. Runs the existing **read-only Supabase preflight** using your local private
   `worker/.env` (never uploads or displays keys).
2. Checks existing Python processes and **does not launch duplicates**.
3. Starts missing DataDoc, Classic Outlook draft, and Dispatch Tracking agents.
   Each worker also holds a per-process lock so two website clicks cannot
   launch duplicate agent instances.
4. Opens the real **PJS Operations** Vercel site in your default browser.
5. The website Control Tower shows actual online/paused status only when a
   fresh Supabase heartbeat is received; starting a process is not enough.

## Install on the authorized Windows office PC (one time)

1. Download the latest project `main` ZIP from GitHub and update the
   **worker scripts only** at your existing office worker folder. **Keep your
   existing .env exactly as it is.** Do not overwrite it with .env.example.
2. Open PowerShell inside the updated `worker` folder.
3. Run this once:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\\INSTALL_PJS_WEBSITE_SHORTCUT.ps1"
   ```

4. A desktop shortcut named **PJS Operations - Start Agents** will appear.
5. Double-click that shortcut rather than opening a normal website bookmark.
   The first run may open three Python windows. Leave them running while you
   use DataDoc / Classic Outlook / Selenium on that signed-in Windows PC.

## Safety and operation

- This does **not** automatically enable any live automation settings.
  It respects the existing `PJS_ENABLE_LIVE_DATADOC`,
  `PJS_ENABLE_OUTLOOK_DRAFT`, `PJS_ENABLE_LIVE_TRACKING` and
  `PJS_ENABLE_LIVE_DATADOC_EMAIL` settings.
- **If a live flag is already 1, opening the shortcut starts its worker and
  may process previously approved queued jobs.** Review local .env settings
  and queued work before using it. Keep untested DataDoc Email Submit off.
- The website cannot remotely wake a powered-off PC, unlock Windows, or
  start Python from an ordinary web URL without an installed native helper.
- Online status means a live heartbeat; paused means connected but disabled;
  offline means the worker is not reporting.
- If the starter fails, review preflight and local `worker/logs`. Never share
  private credentials or the contents of .env.
- Remove the shortcut to stop using one-click startup. Removing the shortcut
  **does not stop already running workers**; Ctrl+C in their console or sign
  out of Windows to stop the processes.
- Website and Supabase remain cloud hosted. **Only the office PC executes
  DataDoc, Outlook and Selenium carrier automation.**
