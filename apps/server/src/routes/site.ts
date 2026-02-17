import { Router } from "express";

export const siteRouter = Router();

siteRouter.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AlcoMatcher | Fast Alcohol Label Compliance Checks</title>
    <meta name="description" content="AlcoMatcher delivers scanner-first alcohol label compliance checks in seconds. Offline-first and built for field agents and compliance administrators." />
    <style>
      :root {
        --wood-900: #2f1c14;
        --wood-700: #5a3a2a;
        --wood-500: #7e5b42;
        --cask-300: #e6c18a;
        --cask-500: #c08a3c;
        --foam: #f6e7cf;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Avenir Next", "Segoe UI", "Trebuchet MS", sans-serif;
        color: var(--foam);
        background:
          radial-gradient(1200px 420px at 78% -15%, rgba(255, 230, 177, 0.2) 0%, transparent 60%),
          linear-gradient(165deg, #6f4f37 0%, #5a3c2d 36%, #3f2d24 72%, #2f211a 100%);
        min-height: 100vh;
      }
      .wrap {
        max-width: 1020px;
        margin: 0 auto;
        padding: 24px 20px 44px;
      }
      .brand {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        padding: 8px 14px 8px 10px;
        border-radius: 999px;
        background: rgba(255, 239, 206, 0.15);
        border: 1px solid rgba(230, 193, 138, 0.35);
        backdrop-filter: blur(4px);
      }
      .brand .crest-dot {
        width: 20px;
        height: 20px;
        border-radius: 999px;
        border: 1px solid rgba(246, 214, 162, 0.4);
        background: radial-gradient(circle at 30% 25%, #f5d9a6, #c79043 58%, #8d5e2f 100%);
        box-shadow: inset 0 0 0 1px rgba(255, 244, 222, 0.2);
      }
      h1 {
        margin: 20px 0 10px;
        font-size: clamp(2rem, 5.5vw, 3.4rem);
        line-height: 1.04;
        color: #ffe7be;
      }
      .sub {
        max-width: 760px;
        font-size: clamp(1rem, 2.2vw, 1.2rem);
        color: rgba(248, 230, 201, 0.94);
      }
      .cta-row {
        margin-top: 24px;
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }
      .btn {
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 48px;
        padding: 12px 18px;
        border-radius: 12px;
        font-weight: 700;
        border: 1px solid rgba(242, 216, 172, 0.2);
      }
      .btn-primary {
        color: #1e110c;
        background: linear-gradient(180deg, #e0b56e, #c89242);
      }
      .btn-secondary {
        color: #ffefcf;
        background: rgba(25, 15, 10, 0.34);
      }
      .cards {
        margin-top: 26px;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
        gap: 12px;
      }
      .card {
        background: rgba(22, 14, 10, 0.34);
        border: 1px solid rgba(236, 204, 151, 0.22);
        border-radius: 14px;
        padding: 14px;
      }
      .card h3 {
        margin: 0 0 6px;
        color: #ffdfab;
        font-size: 1.04rem;
      }
      .card p { margin: 0; color: rgba(245, 226, 194, 0.9); }
      .hero-strap {
        margin-top: 22px;
        padding: 14px;
        border-radius: 14px;
        border: 1px solid rgba(233, 196, 131, 0.34);
        background: linear-gradient(90deg, rgba(35, 22, 15, 0.65), rgba(69, 45, 31, 0.66));
        color: #ffe8bf;
        font-weight: 600;
      }
      footer {
        margin-top: 24px;
        color: rgba(252, 234, 205, 0.72);
        font-size: 0.92rem;
      }
    </style>
  </head>
  <body>
    <main class="wrap">
      <div class="brand"><span class="crest-dot" aria-hidden="true"></span>AlcoMatcher</div>
      <h1>Heritage-Grade Alcohol Label Compliance</h1>
      <p class="sub">
        Scanner-first alcohol label verification for field agents and compliance admins.
        Run a check in seconds, get clear pass/fail reasons, and move the queue forward.
      </p>
      <div class="cta-row">
        <a class="btn btn-primary" href="/scanner">Open Scanner</a>
        <a class="btn btn-secondary" href="/admin/queue">Open Admin Queue</a>
        <a class="btn btn-secondary" href="/admin/batches">Batch Drill-Down</a>
        <a class="btn btn-secondary" href="/admin/dashboard">KPI Dashboard</a>
        <a class="btn btn-secondary" href="/health">System Health</a>
      </div>
      <section class="cards">
        <article class="card">
          <h3>Scanner-First UX</h3>
          <p>Open the app and scan immediately. No login required to get first value.</p>
        </article>
        <article class="card">
          <h3>Offline-First Design</h3>
          <p>Process locally first and sync automatically when a connection returns.</p>
        </article>
        <article class="card">
          <h3>Transparent Checks</h3>
          <p>Every compliance decision includes itemized checks and clear rationale.</p>
        </article>
      </section>
      <div class="hero-strap">Brewery-caliber clarity for field scans, admin review queues, and same-day decisions.</div>
      <footer>alcomatcher.com</footer>
    </main>
  </body>
</html>`);
});

siteRouter.get("/scanner", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AlcoMatcher Scanner</title>
    <style>
      :root {
        --bg: linear-gradient(155deg, #73533b 0%, #5b3d2c 40%, #35261d 100%);
        --card: rgba(25, 16, 12, 0.62);
        --ink: #f5e6cd;
        --accent: #c08a3c;
        --ready: #41ab5b;
        --working: #dfa33b;
        --failed: #c44737;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Avenir Next", "Segoe UI", "Trebuchet MS", sans-serif;
        color: var(--ink);
        background: var(--bg);
      }
      .wrap { max-width: 820px; margin: 0 auto; padding: 20px 16px 32px; }
      .card {
        background: var(--card);
        border: 1px solid rgba(233, 201, 150, 0.25);
        border-radius: 16px;
        padding: 16px;
      }
      h1 { margin: 0 0 8px; color: #ffe5b4; }
      p { color: rgba(243, 228, 200, 0.92); }
      .stack { display: grid; gap: 12px; }
      .grid { display: grid; gap: 8px; grid-template-columns: 1fr 1fr; }
      .row { display: grid; gap: 8px; }
      input[type="text"], input[type="file"] {
        width: 100%;
        min-height: 44px;
        border-radius: 10px;
        border: 1px solid rgba(231, 200, 149, 0.25);
        padding: 10px 12px;
        background: rgba(255, 250, 242, 0.94);
      }
      button {
        width: 100%;
        min-height: 48px;
        border: none;
        border-radius: 12px;
        font-size: 1rem;
        font-weight: 700;
        color: #20120c;
        background: var(--accent);
      }
      button:disabled { opacity: 0.65; }
      .thumbs { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; }
      .thumb {
        border-radius: 10px;
        padding: 3px;
        border: 3px solid rgba(0,0,0,0.2);
        background: #fff;
      }
      .thumb.uploading, .thumb.processing { border-color: var(--working); }
      .thumb.ready { border-color: var(--ready); }
      .thumb.failed { border-color: var(--failed); }
      .thumb img { width: 100%; border-radius: 8px; display: block; }
      .thumb .meta { margin-top: 4px; font-size: 0.78rem; font-weight: 700; }
      #uploadList { margin: 0; padding-left: 16px; font-size: 0.92rem; }
      #result {
        display: none;
        margin-top: 10px;
        padding: 12px;
        border-radius: 12px;
        background: #f8f0df;
        color: #2c1a11;
        border: 1px solid rgba(52,35,24,0.28);
      }
      #result ul { margin: 6px 0 0; padding-left: 20px; }
      .small { font-size: 0.92rem; opacity: 0.95; color: rgba(245, 227, 193, 0.82); }
      .nav { margin-top: 12px; }
      .nav a { color: #f6ddb2; text-decoration: none; font-weight: 700; }
      @media (max-width: 640px) {
        .grid { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main class="wrap">
      <section class="card stack">
        <h1>Scanner</h1>
        <p>Capture front and back images, then run the quick compliance check.</p>

        <div class="grid">
          <input id="expectedBrandName" type="text" placeholder="Expected Brand Name (optional)" />
          <input id="expectedClassType" type="text" placeholder="Expected Class/Type (optional)" />
        </div>
        <div class="grid">
          <input id="expectedAbvText" type="text" placeholder="Expected ABV (optional)" />
          <input id="expectedNetContents" type="text" placeholder="Expected Net Contents (optional)" />
        </div>

        <div class="row">
          <label>Front Label Photo</label>
          <input id="frontPhoto" type="file" accept="image/*" capture="environment" />
        </div>
        <div class="row">
          <label>Back Label Photo</label>
          <input id="backPhoto" type="file" accept="image/*" capture="environment" />
        </div>
        <div class="row">
          <label>Additional Photos (optional, up to 4)</label>
          <input id="additionalPhotos" type="file" accept="image/*" capture="environment" multiple />
        </div>

        <div class="thumbs" id="thumbs"></div>
        <ol id="uploadList"></ol>

        <button id="runCheck" type="button">Run Quick Check</button>
        <div id="result"></div>
        <div class="small">Front/back are required. Additional photos help with curved or partial labels.</div>
      </section>
      <div class="nav"><a href="/">← Back to Home</a></div>
    </main>
    <script>
      const runBtn = document.getElementById("runCheck");
      const result = document.getElementById("result");
      const thumbs = document.getElementById("thumbs");
      const uploadList = document.getElementById("uploadList");
      const frontInput = document.getElementById("frontPhoto");
      const backInput = document.getElementById("backPhoto");
      const additionalInput = document.getElementById("additionalPhotos");
      const expectedBrandNameInput = document.getElementById("expectedBrandName");
      const expectedClassTypeInput = document.getElementById("expectedClassType");
      const expectedAbvTextInput = document.getElementById("expectedAbvText");
      const expectedNetContentsInput = document.getElementById("expectedNetContents");

      const state = {
        front: null,
        back: null,
        additional: []
      };

      function listFiles() {
        const files = [];
        if (state.front) files.push({ role: "front", file: state.front, status: "ready" });
        if (state.back) files.push({ role: "back", file: state.back, status: "ready" });
        state.additional.forEach((file, index) => files.push({ role: "additional #" + (index + 1), file, status: "ready" }));
        return files;
      }

      function renderPreviews() {
        const files = listFiles();
        thumbs.innerHTML = files.map((entry) => {
          const url = URL.createObjectURL(entry.file);
          return "<div class='thumb " + entry.status + "'><img src='" + url + "' alt='preview' /><div class='meta'>" + entry.role + " · " + entry.status.toUpperCase() + "</div></div>";
        }).join("");

        uploadList.innerHTML = files.map((entry) => "<li>" + entry.role + ": " + entry.status.toUpperCase() + "</li>").join("");
      }

      function renderError(message) {
        result.style.display = "block";
        result.style.background = "#fff1ef";
        result.style.borderColor = "rgba(175,45,24,0.25)";
        result.innerHTML = "<strong>Check failed:</strong> " + message;
      }

      function mapScannerError(payload, statusCode) {
        if (payload && payload.error === "photo_too_large") return "One or more images are larger than 12MB.";
        if (payload && payload.error === "front_photo_required") return "Front label photo is required.";
        if (payload && payload.error === "back_photo_required") return "Back label photo is required.";
        if (statusCode === 413) return "Image upload too large. Retry with smaller images.";
        const requestRef = payload && payload.request_id ? " (ref: " + payload.request_id + ")" : "";
        if (payload && payload.detail) return payload.detail + requestRef;
        if (payload && payload.error) return payload.error + requestRef;
        return "Try again in a few seconds.";
      }

      function renderResult(scan) {
        const statusColor = scan.summary === "pass" ? "#1f7a44" : scan.summary === "fail" ? "#9b2c20" : "#9a6b12";
        const checksHtml = (scan.checks || []).map((check) => "<li><strong>" + check.label + ":</strong> " + check.status.toUpperCase() + " - " + check.detail + "</li>").join("");
        result.style.display = "block";
        result.style.background = "#f8fafc";
        result.style.borderColor = "rgba(33,33,33,0.18)";
        result.innerHTML =
          "<div><strong style='color:" + statusColor + "'>Summary: " + scan.summary.toUpperCase() + "</strong></div>" +
          "<div>Application ID: " + (scan.applicationId || "n/a") + "</div>" +
          "<div>Confidence: " + Math.round((scan.confidence || 0) * 100) + "%</div>" +
          "<div style='margin-top:8px'><strong>Composite Detected Fields</strong></div>" +
          "<div>Brand: " + (scan.extracted.brandName || "not detected") + "</div>" +
          "<div>Class/Type: " + (scan.extracted.classType || "not detected") + "</div>" +
          "<div>ABV: " + (scan.extracted.abvText || "not detected") + "</div>" +
          "<div>Net Contents: " + (scan.extracted.netContents || "not detected") + "</div>" +
          "<div>Gov Warning: " + (scan.extracted.hasGovWarning ? "detected" : "not detected") + "</div>" +
          "<div style='margin-top:8px'><strong>Checks</strong></div><ul>" + checksHtml + "</ul>";
      }

      frontInput.addEventListener("change", (event) => {
        state.front = event.target.files && event.target.files[0] ? event.target.files[0] : null;
        renderPreviews();
      });

      backInput.addEventListener("change", (event) => {
        state.back = event.target.files && event.target.files[0] ? event.target.files[0] : null;
        renderPreviews();
      });

      additionalInput.addEventListener("change", (event) => {
        state.additional = Array.from(event.target.files || []).slice(0, 4);
        renderPreviews();
      });

      runBtn.addEventListener("click", async () => {
        if (!state.front || !state.back) {
          renderError("Front and back photos are required.");
          return;
        }

        runBtn.disabled = true;
        runBtn.textContent = "Checking...";
        result.style.display = "block";
        result.style.background = "#fffbf2";
        result.style.borderColor = "rgba(0,0,0,0.1)";
        result.innerHTML = "Uploading images and running checks...";

        try {
          const formData = new FormData();
          formData.append("frontPhoto", state.front);
          formData.append("backPhoto", state.back);
          state.additional.forEach((file) => formData.append("additionalPhotos", file));
          if (expectedBrandNameInput.value.trim()) formData.append("expectedBrandName", expectedBrandNameInput.value.trim());
          if (expectedClassTypeInput.value.trim()) formData.append("expectedClassType", expectedClassTypeInput.value.trim());
          if (expectedAbvTextInput.value.trim()) formData.append("expectedAbvText", expectedAbvTextInput.value.trim());
          if (expectedNetContentsInput.value.trim()) formData.append("expectedNetContents", expectedNetContentsInput.value.trim());
          formData.append("requireGovWarning", "true");

          const scanRes = await fetch("/api/scanner/quick-check", { method: "POST", body: formData });
          if (!scanRes.ok) {
            const payload = await scanRes.json().catch(() => ({}));
            throw new Error(mapScannerError(payload, scanRes.status));
          }

          const scan = await scanRes.json();
          renderResult(scan);
        } catch (error) {
          renderError(error && error.message ? error.message : "Try again in a few seconds.");
        } finally {
          runBtn.disabled = false;
          runBtn.textContent = "Run Quick Check";
        }
      });
    </script>
  </body>
</html>`);
});
siteRouter.get("/admin/queue", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AlcoMatcher Admin Queue</title>
    <style>
      :root {
        --bg: linear-gradient(155deg, #6d4e38 0%, #563a2b 42%, #34251c 100%);
        --ink: #f4e5cb;
        --accent: #c08a3c;
        --card: rgba(25, 16, 12, 0.62);
      }
      body { margin: 0; font-family: "Avenir Next", "Segoe UI", "Trebuchet MS", sans-serif; background: var(--bg); color: var(--ink); }
      .wrap { max-width: 1100px; margin: 0 auto; padding: 20px 16px 30px; }
      .toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 14px; flex-wrap: wrap; }
      select, button {
        min-height: 40px;
        border-radius: 10px;
        border: 1px solid rgba(239, 210, 164, 0.25);
        padding: 8px 10px;
        background: rgba(254, 248, 236, 0.96);
      }
      button { background: var(--accent); color: #24150d; border: none; font-weight: 700; }
      table {
        width: 100%;
        border-collapse: collapse;
        background: var(--card);
        border-radius: 12px;
        overflow: hidden;
        border: 1px solid rgba(234, 202, 149, 0.2);
      }
      th, td {
        text-align: left;
        padding: 10px;
        border-bottom: 1px solid rgba(255,255,255,0.09);
        font-size: 0.95rem;
      }
      th { background: rgba(225, 181, 110, 0.25); color: #ffe5b6; }
      .muted { opacity: 0.9; font-size: 0.93rem; margin-top: 8px; color: rgba(247, 232, 205, 0.84); }
      .links a { color: #f6ddb2; text-decoration: none; font-weight: 700; }
      td a { color: #f8d9a2; }
    </style>
  </head>
  <body>
    <main class="wrap">
      <h1>Compliance Admin Queue</h1>
      <div class="toolbar">
        <label for="statusFilter">Filter status:</label>
        <select id="statusFilter">
          <option value="">All</option>
          <option value="needs_review">Needs review</option>
          <option value="rejected">Rejected</option>
          <option value="matched">Matched</option>
          <option value="batch_received">Batch received</option>
          <option value="batch_processing">Batch processing</option>
          <option value="batch_completed">Batch completed</option>
        </select>
        <button id="refreshBtn" type="button">Refresh Queue</button>
        <a href="/admin/batches" style="text-decoration:none"><button type="button">Batch Drill-Down</button></a>
        <a href="/admin/dashboard" style="text-decoration:none"><button type="button">Open KPI Dashboard</button></a>
      </div>
      <table>
        <thead>
          <tr>
            <th>Application</th>
            <th>Status</th>
            <th>Sync</th>
            <th>Summary</th>
            <th>Confidence</th>
            <th>Updated</th>
            <th>Report</th>
          </tr>
        </thead>
        <tbody id="queueRows"></tbody>
      </table>
      <p class="muted">Admin view is live-backed by event projections and compliance report endpoints.</p>
      <p class="links"><a href="/">← Back to Home</a></p>
    </main>
    <script>
      const queueRows = document.getElementById("queueRows");
      const refreshBtn = document.getElementById("refreshBtn");
      const statusFilter = document.getElementById("statusFilter");
      let refreshTimer = null;

      function renderRows(items) {
        if (!items.length) {
          queueRows.innerHTML = "<tr><td colspan='7'>No queue items.</td></tr>";
          return;
        }
        queueRows.innerHTML = items.map((item) => {
          const projection = item.projection || {};
          const quickCheck = projection.latestQuickCheck || {};
          const confidence = typeof quickCheck.confidence === "number" ? Math.round(quickCheck.confidence * 100) + "%" : "n/a";
          return "<tr>" +
            "<td>" + item.applicationId + "</td>" +
            "<td>" + item.status + "</td>" +
            "<td>" + item.syncState + "</td>" +
            "<td>" + (quickCheck.summary || "n/a") + "</td>" +
            "<td>" + confidence + "</td>" +
            "<td>" + (item.updatedAt || "n/a") + "</td>" +
            "<td><a href='/api/applications/" + item.applicationId + "/report' target='_blank' rel='noreferrer'>JSON</a></td>" +
          "</tr>";
        }).join("");
      }

      async function loadQueue() {
        const status = statusFilter.value;
        const url = status ? "/api/admin/queue?status=" + encodeURIComponent(status) : "/api/admin/queue";
        try {
          const response = await fetch(url);
          const payload = await response.json();
          renderRows((payload && payload.queue) ? payload.queue : []);
        } catch (error) {
          queueRows.innerHTML = "<tr><td colspan='7'>Failed to load queue.</td></tr>";
        }
      }

      function scheduleQueueRefresh() {
        if (refreshTimer) return;
        refreshTimer = setTimeout(() => {
          refreshTimer = null;
          loadQueue();
        }, 400);
      }

      refreshBtn.addEventListener("click", loadQueue);
      statusFilter.addEventListener("change", loadQueue);
      if (typeof EventSource !== "undefined") {
        const events = new EventSource("/api/events/stream?scope=admin");
        events.addEventListener("sync.ack", scheduleQueueRefresh);
        events.addEventListener("application.status_changed", scheduleQueueRefresh);
        events.addEventListener("batch.progress", scheduleQueueRefresh);
      }
      loadQueue();
    </script>
  </body>
</html>`);
});

siteRouter.get("/admin/dashboard", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AlcoMatcher KPI Dashboard</title>
    <style>
      :root {
        --bg: linear-gradient(155deg, #6c4d38 0%, #4f3629 42%, #31231b 100%);
        --card: rgba(24, 15, 11, 0.62);
        --ink: #f3e3c7;
        --accent: #c08a3c;
      }
      body { margin: 0; font-family: "Avenir Next", "Segoe UI", "Trebuchet MS", sans-serif; background: var(--bg); color: var(--ink); }
      .wrap { max-width: 1100px; margin: 0 auto; padding: 20px 16px 28px; }
      .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
      .card { background: var(--card); border: 1px solid rgba(233, 199, 145, 0.22); border-radius: 12px; padding: 12px; }
      .k { font-size: 1.5rem; font-weight: 800; margin-top: 6px; }
      .toolbar { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; align-items: center; }
      button, select {
        min-height: 40px;
        border-radius: 10px;
        border: 1px solid rgba(236, 205, 154, 0.26);
        padding: 8px 10px;
        background: rgba(255, 251, 244, 0.96);
      }
      button { background: var(--accent); color: #24150d; border: none; font-weight: 700; }
      pre {
        background: #f7efdf;
        border: 1px solid rgba(49,32,23,0.24);
        color: #2f1d13;
        border-radius: 10px;
        padding: 10px;
        white-space: pre-wrap;
      }
      .nav a { text-decoration: none; font-weight: 700; color: #f3d9ab; }
    </style>
  </head>
  <body>
    <main class="wrap">
      <h1>KPI Dashboard</h1>
      <div class="toolbar">
        <label for="windowHours">Window:</label>
        <select id="windowHours">
          <option value="24">24 hours</option>
          <option value="72">72 hours</option>
          <option value="168">7 days</option>
        </select>
        <button id="refreshBtn" type="button">Refresh KPIs</button>
        <button id="backfillBtn" type="button">Backfill pending_sync -> synced</button>
      </div>
      <section class="cards" id="kpiCards"></section>
      <h3>Raw KPI Payload</h3>
      <pre id="raw"></pre>
      <p class="nav"><a href="/admin/queue">Open Queue</a> · <a href="/admin/batches">Batch Drill-Down</a> · <a href="/">Home</a></p>
    </main>
    <script>
      const kpiCards = document.getElementById("kpiCards");
      const raw = document.getElementById("raw");
      const windowHours = document.getElementById("windowHours");
      const refreshBtn = document.getElementById("refreshBtn");
      const backfillBtn = document.getElementById("backfillBtn");
      let refreshTimer = null;

      function card(label, value) {
        return "<article class='card'><div>" + label + "</div><div class='k'>" + value + "</div></article>";
      }

      function render(kpis) {
        const fallbackRate = Math.round((kpis.scanPerformance.fallbackRate || 0) * 100);
        const avgConfidence = Math.round((kpis.scanPerformance.avgConfidence || 0) * 100);
        kpiCards.innerHTML =
          card("Total Applications", kpis.totals.applications) +
          card("Quick Checks", kpis.totals.quickChecks) +
          card("Scan p50 (ms)", kpis.scanPerformance.p50Ms) +
          card("Scan p95 (ms)", kpis.scanPerformance.p95Ms) +
          card("Fallback Rate", fallbackRate + "%") +
          card("Avg Confidence", avgConfidence + "%") +
          card("Synced", kpis.syncHealth.synced) +
          card("Pending Sync", kpis.syncHealth.pending_sync) +
          card("Sync Failed", kpis.syncHealth.sync_failed);
        raw.textContent = JSON.stringify(kpis, null, 2);
      }

      async function loadKpis() {
        const hours = windowHours.value;
        const response = await fetch("/api/admin/kpis?windowHours=" + encodeURIComponent(hours));
        const payload = await response.json();
        render(payload.kpis || {});
      }

      async function runBackfill() {
        const response = await fetch("/api/admin/backfill/sync-state", { method: "POST" });
        const payload = await response.json();
        alert("Backfill complete: " + payload.updatedCount + " rows updated");
        loadKpis();
      }

      function scheduleRefresh() {
        if (refreshTimer) return;
        refreshTimer = setTimeout(() => {
          refreshTimer = null;
          loadKpis();
        }, 500);
      }

      refreshBtn.addEventListener("click", loadKpis);
      backfillBtn.addEventListener("click", runBackfill);
      windowHours.addEventListener("change", loadKpis);
      if (typeof EventSource !== "undefined") {
        const events = new EventSource("/api/events/stream?scope=admin");
        events.addEventListener("sync.ack", scheduleRefresh);
        events.addEventListener("application.status_changed", scheduleRefresh);
        events.addEventListener("batch.progress", scheduleRefresh);
      }
      loadKpis();
    </script>
  </body>
</html>`);
});

siteRouter.get("/admin/batches", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AlcoMatcher Batch Drill-Down</title>
    <style>
      :root { --bg:linear-gradient(155deg, #6b4b36 0%, #50392b 40%, #30231b 100%); --card:rgba(24,15,11,0.62); --ink:#f4e4c8; --accent:#c08a3c; }
      body { margin:0; font-family:"Avenir Next","Segoe UI","Trebuchet MS",sans-serif; background:var(--bg); color:var(--ink); }
      .wrap { max-width:1200px; margin:0 auto; padding:20px 16px 28px; }
      .toolbar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:12px; }
      button, select { min-height:40px; border-radius:10px; border:1px solid rgba(239,206,156,0.28); padding:8px 10px; background:rgba(255,251,244,0.96); }
      button { background:var(--accent); color:#24150d; border:none; font-weight:700; }
      .grid { display:grid; gap:10px; grid-template-columns: 1.2fr 1fr; }
      @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
      .panel { background:var(--card); border:1px solid rgba(232,198,145,0.22); border-radius:12px; padding:12px; }
      table { width:100%; border-collapse:collapse; }
      th, td { text-align:left; padding:8px; border-bottom:1px solid rgba(255,255,255,0.09); font-size:0.93rem; }
      th { color: #ffe5b7; background: rgba(225, 181, 110, 0.22); }
      tr.clickable { cursor:pointer; }
      tr.clickable:hover { background:rgba(255,255,255,0.06); }
      pre { white-space:pre-wrap; background:#f7efdf; border:1px solid rgba(49,32,23,0.24); color:#2f1d13; border-radius:10px; padding:10px; }
      .nav a { color:#f3d9ab; text-decoration:none; font-weight:700; }
    </style>
  </head>
  <body>
    <main class="wrap">
      <h1>Batch Reliability Drill-Down</h1>
      <div class="toolbar">
        <label for="batchSelect">Batch:</label>
        <select id="batchSelect"></select>
        <button id="refreshBtn" type="button">Refresh</button>
      </div>
      <section class="grid">
        <article class="panel">
          <h3>Batch Items (click a line item)</h3>
          <table>
            <thead>
              <tr><th>Item</th><th>File</th><th>Status</th><th>Retries</th><th>Error</th></tr>
            </thead>
            <tbody id="itemRows"></tbody>
          </table>
        </article>
        <article class="panel">
          <h3>Line Item Detail</h3>
          <pre id="itemDetail">Select a line item to view rich failure reasons and retry history.</pre>
        </article>
      </section>
      <p class="nav"><a href="/admin/queue">Queue</a> · <a href="/admin/dashboard">Dashboard</a> · <a href="/">Home</a></p>
    </main>
    <script>
      const batchSelect = document.getElementById("batchSelect");
      const itemRows = document.getElementById("itemRows");
      const itemDetail = document.getElementById("itemDetail");
      const refreshBtn = document.getElementById("refreshBtn");
      let currentBatchId = "";
      let refreshTimer = null;

      async function loadBatches() {
        const response = await fetch("/api/batches?limit=100");
        const payload = await response.json();
        const batches = payload.batches || [];
        batchSelect.innerHTML = batches.map((b) => "<option value='" + b.batchId + "'>" + b.batchId + " · " + b.status + " · " + b.updatedAt + "</option>").join("");
        if (!currentBatchId && batches.length > 0) currentBatchId = batches[0].batchId;
        if (currentBatchId) batchSelect.value = currentBatchId;
      }

      async function loadItems() {
        currentBatchId = batchSelect.value;
        if (!currentBatchId) {
          itemRows.innerHTML = "<tr><td colspan='5'>No batches found.</td></tr>";
          return;
        }
        const response = await fetch("/api/batches/" + encodeURIComponent(currentBatchId) + "?limit=500&offset=0");
        const payload = await response.json();
        const items = payload.items || [];
        if (!items.length) {
          itemRows.innerHTML = "<tr><td colspan='5'>No line items.</td></tr>";
          return;
        }
        itemRows.innerHTML = items.map((item) =>
          "<tr class='clickable' data-id='" + item.batchItemId + "'>" +
            "<td>" + item.clientLabelId + "</td>" +
            "<td>" + item.imageFilename + "</td>" +
            "<td>" + item.status + "</td>" +
            "<td>" + (item.retryCount || 0) + "</td>" +
            "<td>" + (item.lastErrorCode || "none") + "</td>" +
          "</tr>"
        ).join("");
      }

      async function loadItemDetail(batchItemId) {
        const response = await fetch("/api/batches/" + encodeURIComponent(currentBatchId) + "/items/" + encodeURIComponent(batchItemId));
        const payload = await response.json();
        itemDetail.textContent = JSON.stringify(payload, null, 2);
      }

      function wireRowClicks() {
        itemRows.querySelectorAll("tr.clickable").forEach((row) => {
          row.addEventListener("click", () => {
            const id = row.getAttribute("data-id");
            if (id) loadItemDetail(id);
          });
        });
      }

      async function refreshAll() {
        await loadBatches();
        await loadItems();
        wireRowClicks();
      }

      function scheduleRefresh() {
        if (refreshTimer) return;
        refreshTimer = setTimeout(async () => {
          refreshTimer = null;
          await refreshAll();
        }, 500);
      }

      refreshBtn.addEventListener("click", refreshAll);
      batchSelect.addEventListener("change", async () => {
        await loadItems();
        wireRowClicks();
      });
      if (typeof EventSource !== "undefined") {
        const events = new EventSource("/api/events/stream?scope=admin");
        events.addEventListener("batch.progress", scheduleRefresh);
      }
      refreshAll();
    </script>
  </body>
</html>`);
});
