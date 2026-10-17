/**
 * Photo Drop backend, for the private upload page.
 *
 * The browser never gets a Drive token and never sees the folder it writes to.
 * It asks this script for one resumable-upload session URL per file, then PUTs
 * the bytes straight to Google's upload endpoint. File bytes never pass through
 * Apps Script, so the script's quotas barely move no matter how large the batch.
 *
 * Files land directly in FOLDER_ID. No subfolders are created; the uploader's
 * name is recorded on each file's description instead, so the folder stays flat.
 *
 * Script Properties (Project Settings -> Script Properties). Never put these in code:
 *   PASSCODE         required  the shared passcode the page asks for
 *   FOLDER_ID        required  id of the Drive folder that receives the uploads
 *   ALLOWED_ORIGIN   required  origin of the upload page, e.g. https://niya-forever.in
 *                              comma-separated list allowed, e.g. to add http://localhost:8000
 *   UPLOADS_ENABLED  optional  set to "false" to turn the page off without redeploying
 *
 * Responses are always HTTP 200 with a JSON body ({ ok: true, ... } or
 * { ok: false, error: "..." }) because Apps Script web apps cannot set status codes.
 */

var PROP_PASSCODE = 'PASSCODE';
var PROP_FOLDER_ID = 'FOLDER_ID';
var PROP_ORIGIN = 'ALLOWED_ORIGIN';
var PROP_ENABLED = 'UPLOADS_ENABLED';

/** Refuse absurd sizes early. Drive itself allows far more; this is a sanity cap. */
var MAX_FILE_BYTES = 20 * 1024 * 1024 * 1024; // 20 GB

/** Pause before answering a wrong passcode, to make guessing slow. */
var WRONG_PASSCODE_DELAY_MS = 900;


/* ------------------------------------------------------------------ entry points */

/**
 * Nothing useful is served over GET, so a stray visit to the /exec URL
 * reveals neither the folder nor whether the passcode is right.
 */
function doGet() {
  return reply_({ ok: false, error: 'Not available.' });
}

/**
 * Body is JSON (sent as text/plain so the browser skips the CORS preflight):
 *   { action: "check", passcode }
 *   { action: "start", passcode, fileName, mimeType, size, uploaderName, origin }
 */
function doPost(e) {
  try {
    var props = PropertiesService.getScriptProperties();

    if (String(props.getProperty(PROP_ENABLED) || '').toLowerCase() === 'false') {
      return reply_({ ok: false, error: 'Uploads are closed right now.', code: 'CLOSED' });
    }

    var passcode = props.getProperty(PROP_PASSCODE);
    var folderId = props.getProperty(PROP_FOLDER_ID);
    if (!passcode || !folderId) {
      return reply_({ ok: false, error: 'Server is not configured yet.', code: 'NOT_CONFIGURED' });
    }

    var req = parseBody_(e);

    if (!equalsSlowly_(String(req.passcode == null ? '' : req.passcode), passcode)) {
      Utilities.sleep(WRONG_PASSCODE_DELAY_MS);
      return reply_({ ok: false, error: 'That passcode is not right.', code: 'BAD_PASSCODE' });
    }

    var action = String(req.action || 'start');
    if (action === 'check') {
      return reply_({ ok: true });
    }
    if (action !== 'start') {
      return reply_({ ok: false, error: 'Unknown action.', code: 'BAD_ACTION' });
    }

    // The page tells us which origin it is served from; we only accept one we
    // were configured with, and send exactly that back to Drive as the Origin
    // header so the browser is allowed to PUT to the session URL.
    var origin = matchAllowedOrigin_(req.origin, props.getProperty(PROP_ORIGIN));
    if (!origin) {
      return reply_({
        ok: false,
        code: 'BAD_ORIGIN',
        error: 'This page is not on the allow-list. Add its origin to ALLOWED_ORIGIN.'
      });
    }

    var size = Number(req.size);
    if (!isFinite(size) || size < 0 || Math.floor(size) !== size) {
      return reply_({ ok: false, error: 'Bad file size.', code: 'BAD_SIZE' });
    }
    if (size > MAX_FILE_BYTES) {
      return reply_({ ok: false, error: 'That file is too large for this page.', code: 'TOO_LARGE' });
    }

    var fileName = cleanFileName_(req.fileName);
    var mimeType = cleanMimeType_(req.mimeType);
    var uploader = cleanPersonName_(req.uploaderName);

    // Confirms the folder exists and that this script may write to it, before
    // handing the browser a session URL it would only fail to use.
    var folder = DriveApp.getFolderById(folderId);

    var sessionUrl = startResumableSession_({
      fileName: fileName,
      mimeType: mimeType,
      size: size,
      folderId: folderId,
      origin: origin,
      uploader: uploader
    });

    return reply_({ ok: true, sessionUrl: sessionUrl, folderName: folder.getName() });

  } catch (err) {
    // Keep Drive's own wording out of the browser; log the detail instead.
    console.error(err && err.stack ? err.stack : err);
    return reply_({ ok: false, error: 'The server could not start this upload.', code: 'SERVER_ERROR' });
  }
}


/* ------------------------------------------------------------------ Drive */

/**
 * Opens a Drive API v3 resumable upload session and returns its URL.
 *
 * The Origin header is the point of this call: Google answers a session URL
 * that only accepts cross-origin PUTs from that origin, which is what lets the
 * photographer's browser upload straight to Drive.
 */
function startResumableSession_(opts) {
  var metadata = {
    name: opts.fileName,
    mimeType: opts.mimeType,
    parents: [opts.folderId],
    // Who sent it and when, without renaming the file or nesting it in a folder.
    description: 'Uploaded by ' + opts.uploader + ' on ' +
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'),
    properties: { uploadedBy: opts.uploader.slice(0, 120) }
  };

  var res = UrlFetchApp.fetch(
    'https://www.googleapis.com/upload/drive/v3/files' +
      '?uploadType=resumable&supportsAllDrives=true&fields=id,name',
    {
      method: 'post',
      contentType: 'application/json; charset=UTF-8',
      headers: {
        Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
        'X-Upload-Content-Type': opts.mimeType,
        'X-Upload-Content-Length': String(opts.size),
        Origin: opts.origin
      },
      payload: JSON.stringify(metadata),
      muteHttpExceptions: true,
      followRedirects: false
    }
  );

  var code = res.getResponseCode();
  if (code !== 200 && code !== 201) {
    throw new Error('Drive refused the session (HTTP ' + code + '): ' +
      String(res.getContentText()).slice(0, 500));
  }

  var sessionUrl = headerValue_(res.getAllHeaders(), 'location');
  if (!sessionUrl) {
    throw new Error('Drive returned no Location header for the session.');
  }
  return sessionUrl;
}

/* ------------------------------------------------------------------ helpers */

function reply_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function parseBody_(e) {
  var raw = e && e.postData ? e.postData.contents : '';
  if (!raw) throw new Error('Empty request body.');
  return JSON.parse(raw);
}

/** Compares every character, so the time taken says nothing about the passcode. */
function equalsSlowly_(a, b) {
  var diff = a.length ^ b.length;
  var n = Math.max(a.length, b.length);
  for (var i = 0; i < n; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** Returns the configured origin that the page's origin matches, or ''. */
function matchAllowedOrigin_(claimed, allowedList) {
  claimed = String(claimed == null ? '' : claimed).trim().replace(/\/+$/, '').toLowerCase();
  if (!claimed) return '';
  var allowed = String(allowedList || '').split(',');
  for (var i = 0; i < allowed.length; i++) {
    var one = allowed[i].trim().replace(/\/+$/, '');
    if (one && one.toLowerCase() === claimed) return one;
  }
  return '';
}

/** Drive takes the name verbatim, so drop path separators and control characters. */
function cleanFileName_(name) {
  var s = String(name == null ? '' : name)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[\\/]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length > 200) {
    var dot = s.lastIndexOf('.');
    var ext = (dot > 0 && s.length - dot <= 12) ? s.slice(dot) : '';
    s = s.slice(0, 200 - ext.length).trim() + ext;
  }
  return s || ('upload-' + Date.now());
}

/** Becomes part of a folder name, so it is stricter than a file name. */
function cleanPersonName_(name) {
  var s = String(name == null ? '' : name)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length > 60) s = s.slice(0, 60).trim();
  return s || 'Unnamed';
}

/** RAW and some video files reach the browser with no detected type. */
function cleanMimeType_(mimeType) {
  var s = String(mimeType == null ? '' : mimeType).trim();
  if (!/^[\w.+-]+\/[\w.+-]+$/.test(s)) return 'application/octet-stream';
  return s;
}

/** UrlFetchApp header names vary in case, and repeats arrive as arrays. */
function headerValue_(headers, wanted) {
  wanted = wanted.toLowerCase();
  for (var key in headers) {
    if (key.toLowerCase() === wanted) {
      var v = headers[key];
      return Array.isArray(v) ? v[0] : v;
    }
  }
  return '';
}


/* ------------------------------------------------------------------ setup check */

/**
 * Run this once from the Apps Script editor after setting the properties.
 * It grants the script its Drive permission and confirms the folder is reachable.
 * It writes nothing.
 */
function checkSetup() {
  var props = PropertiesService.getScriptProperties();
  var passcode = props.getProperty(PROP_PASSCODE);
  var folderId = props.getProperty(PROP_FOLDER_ID);
  var origin = props.getProperty(PROP_ORIGIN);

  var lines = [];
  lines.push('PASSCODE: ' + (passcode ? 'set (' + passcode.length + ' characters)' : 'MISSING'));
  lines.push('ALLOWED_ORIGIN: ' + (origin || 'MISSING'));
  lines.push('UPLOADS_ENABLED: ' + (props.getProperty(PROP_ENABLED) || '(unset, so uploads are on)'));

  if (!folderId) {
    lines.push('FOLDER_ID: MISSING');
  } else {
    try {
      var folder = DriveApp.getFolderById(folderId);
      lines.push('FOLDER_ID: "' + folder.getName() + '" (' + folder.getUrl() + ')');
    } catch (err) {
      lines.push('FOLDER_ID: cannot be opened, ' + err.message);
    }
  }

  lines.push('Time zone: ' + Session.getScriptTimeZone());
  lines.push('Files are placed directly in that folder, with no subfolders.');

  var out = lines.join('\n');
  console.log(out);
  return out;
}
