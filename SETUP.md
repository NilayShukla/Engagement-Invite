# Photo Drop: setup

A private page your photographer can use to upload straight into one Google Drive
folder. They get no access to your Drive and need no Google account. A shared
passcode is checked on the server before any upload can start.

## What is in the repo

| File | What it is |
| --- | --- |
| `drop-7f3k2q/index.html` | the upload page, served at `https://niya-forever.in/drop-7f3k2q/` |
| `apps-script/Code.gs` | the backend that checks the passcode and opens upload sessions |
| `apps-script/appsscript.json` | the Apps Script manifest (scopes and web app settings) |

The page carries `<meta name="robots" content="noindex, nofollow">` and nothing
links to it. The path is deliberately hard to guess and is **not** listed in
`robots.txt`, because that file is public and would give the path away.

Treat the source as public. The passcode and the folder ID are never in the page
or in the repo: they live in Script Properties on the Apps Script side.

---

## 1. Create the Apps Script project

1. Go to https://script.google.com and press **New project**.
2. Name it something like `Photo Drop`.
3. Delete whatever is in `Code.gs` and paste in the contents of
   [apps-script/Code.gs](apps-script/Code.gs).
4. Open **Project Settings** (the gear on the left) and tick
   **Show "appsscript.json" manifest file in editor**.
5. Back in the editor, open `appsscript.json` and replace it with the contents of
   [apps-script/appsscript.json](apps-script/appsscript.json). This declares the
   two scopes the script needs: `drive` and `script.external_request`.

## 2. Set the Script Properties

**Project Settings > Script Properties > Add script property.** Add these four:

| Property | Value |
| --- | --- |
| `PASSCODE` | whatever you want to share with the photographer, for example `niya-shoot-2026` |
| `FOLDER_ID` | `15Ih71zDPQMoo4QR5XYf_WqpWnpAaIj5t` |
| `ALLOWED_ORIGIN` | `https://niya-forever.in` |
| `UPLOADS_ENABLED` | `true` |

`FOLDER_ID` is the long id in your folder link
(`https://drive.google.com/drive/folders/15Ih71zDPQMoo4QR5XYf_WqpWnpAaIj5t`).
Files land directly in that folder. No subfolders are created. Each file gets a
description saying who uploaded it and when, so you can still tell files apart.

`ALLOWED_ORIGIN` must be the exact origin of the page: scheme and host, no path
and no trailing slash. The script sends it to Drive as the `Origin` header, which
is what permits the photographer's browser to upload to the session URL. If it
does not match, uploads are blocked by the browser. You can list more than one,
separated by commas, which is how you would test from `http://localhost:8137`.

## 3. Authorise the script

In the editor, choose the `checkSetup` function in the dropdown and press **Run**.

Google asks you to authorise it. You will see the "Google hasn't verified this
app" screen, because it is your own unpublished script: choose **Advanced**, then
**Go to (your project name)**, then **Allow**.

`checkSetup` writes nothing. It prints your settings and the folder's name to the
execution log, so you can confirm the folder ID is right before going further.

## 4. Deploy it as a web app

1. **Deploy > New deployment**.
2. Press the gear next to "Select type" and pick **Web app**.
3. Description: anything, for example `v1`.
4. **Execute as: Me**. This is what lets the upload go into your Drive without the
   photographer having any access to it.
5. **Who has access: Anyone**. This means anyone with the URL can reach the
   script, which is why the passcode check exists.
6. Press **Deploy** and copy the **Web app URL**. It ends in `/exec`.

## 5. Put the web app URL into the page

Open [drop-7f3k2q/index.html](drop-7f3k2q/index.html) and find this near the top
of the script block:

```js
const CONFIG = {
  WEB_APP_URL: "__PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE__",
```

Replace that placeholder with the `/exec` URL you just copied, then commit and
push. GitHub Pages will publish it at:

```
https://niya-forever.in/drop-7f3k2q/
```

The URL being in a public repo is fine. Without the passcode it does nothing.

## 6. Test it

Open the page. You should get a dialog asking for a name and the passcode.

1. Try a wrong passcode first. It should be refused, with a short delay.
2. Enter the right one, then drop in a handful of files, including one large one,
   and press **Start upload**.
3. While it runs, turn your wifi off for twenty seconds and back on. The page
   should say the connection was lost, then carry on from where it stopped
   rather than starting the file again.
4. Check the Drive folder.

Send the photographer the link and the passcode **in separate messages**. If you
want to save them typing, you can send a link with the passcode in it:
`https://niya-forever.in/drop-7f3k2q/#code=THE-PASSCODE`. The page fills the field
and immediately strips it from the address bar.

---

## Changing the passcode, or turning uploads off

Both are edits to Script Properties. **Neither needs a redeploy** and neither
needs a change to the page.

- **New passcode:** change `PASSCODE`. The old one stops working at once. Anyone
  mid-upload will finish the files already in progress and then be asked for the
  passcode again.
- **Stop uploads:** set `UPLOADS_ENABLED` to `false`. The page then says uploads
  are closed. Set it back to `true` to reopen.
- **Switch folders:** change `FOLDER_ID`.

To shut it off permanently, go to **Deploy > Manage deployments** and archive the
deployment. The URL stops working for everyone.

## If you edit Code.gs later

Apps Script keeps serving the deployed version, not what is in the editor. After
editing, go to **Deploy > Manage deployments**, press the pencil, set
**Version** to **New version**, and press **Deploy**. The URL stays the same.

---

## Limits that apply

These are Google's figures at the time of writing. They do change, so check
[Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas)
and [Drive limits](https://support.google.com/a/answer/172541) if something looks off.

**Per file**

- Maximum file size in Drive: **5 TB**, and it must fit in your free storage.
- Upload chunks must be a multiple of **256 KiB**. The page uses 16 MiB.
- A resumable upload session stays valid for about **one week**, so an interrupted
  file can be resumed long after the fact as long as the page is still open.

**Per day**

- **750 GB uploaded per account per day.** Past that, Drive refuses further
  uploads until the rolling 24 hour window clears. A single file larger than
  750 GB is still allowed, but nothing else that day.
- **20,000 UrlFetch calls per day** on a personal Google account (100,000 on
  Workspace). The script makes one of these per file, so that is the practical
  ceiling on files per day. A 600 file batch uses 600 of them.
- Apps Script allows **30 simultaneous executions**. The page runs 3 uploads at a
  time, so this is never close.
- File bytes never pass through Apps Script: the browser uploads straight to
  Drive. So the Apps Script data transfer quota is not a factor no matter how
  large the batch.

**Other**

- A single Drive folder holds up to **500,000 items**.
- Drive rejects a duplicate name by keeping both, so re-uploading the same card
  gives you two copies rather than overwriting.

## Storage

**Everything uploaded counts against your own Google Drive storage quota**, not
the photographer's. The script runs as you, so you own every file that arrives.

A 600 file batch of 25 to 80 MB RAW files is roughly **15 to 50 GB**. The free
Google account allowance is 15 GB shared across Drive, Gmail and Photos, so for a
full shoot you will almost certainly need a Google One plan. Check your free space
before you send the link: if you run out part way through, uploads start failing
and the photographer has to repeat them.
