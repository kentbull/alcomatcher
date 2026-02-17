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
        --sand-1: #f8e8c7;
        --sand-2: #f0c98f;
        --sand-3: #d98952;
        --rock: #8d4f2a;
        --sky-1: #87d2f0;
        --sky-2: #3fa6d3;
        --ink: #2b1b12;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Avenir Next", "Segoe UI", Roboto, sans-serif;
        color: var(--ink);
        background:
          radial-gradient(1200px 500px at 80% -40%, #fff5cf 0%, transparent 60%),
          linear-gradient(180deg, var(--sky-1) 0%, var(--sky-2) 38%, var(--sand-1) 39%, var(--sand-2) 100%);
        min-height: 100vh;
      }
      .wrap {
        max-width: 1000px;
        margin: 0 auto;
        padding: 24px 20px 48px;
      }
      .brand {
        display: inline-block;
        font-weight: 800;
        letter-spacing: 0.4px;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.72);
        border: 1px solid rgba(0, 0, 0, 0.08);
      }
      h1 {
        margin: 20px 0 12px;
        font-size: clamp(2rem, 6vw, 3.6rem);
        line-height: 1.05;
      }
      .sub {
        max-width: 720px;
        font-size: clamp(1rem, 2.2vw, 1.2rem);
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
        border: 1px solid rgba(0, 0, 0, 0.12);
      }
      .btn-primary {
        color: white;
        background: linear-gradient(180deg, #d37037, #b94f1f);
      }
      .btn-secondary {
        color: #1f130d;
        background: rgba(255, 255, 255, 0.82);
      }
      .cards {
        margin-top: 28px;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
        gap: 12px;
      }
      .card {
        background: rgba(255, 255, 255, 0.82);
        border: 1px solid rgba(0, 0, 0, 0.1);
        border-radius: 14px;
        padding: 14px;
      }
      .card h3 {
        margin: 0 0 6px;
        font-size: 1.04rem;
      }
      .hero-strap {
        margin-top: 30px;
        padding: 14px;
        border-radius: 14px;
        background: linear-gradient(90deg, rgba(141, 79, 42, 0.92), rgba(84, 38, 22, 0.92));
        color: #ffefd8;
        font-weight: 600;
      }
      footer {
        margin-top: 30px;
        opacity: 0.85;
        font-size: 0.92rem;
      }
    </style>
  </head>
  <body>
    <main class="wrap">
      <div class="brand">AlcoMatcher</div>
      <h1>Label Compliance, Fast as a Desert Storm</h1>
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
      <div class="hero-strap">
        Built in St. George spirit: practical, bold, and ready for the field.
      </div>
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
        --bg: #f8ead2;
        --card: #fffaf2;
        --ink: #2f1d12;
        --accent: #c65a2b;
        --ready: #2a8e42;
        --working: #d89f1f;
        --failed: #b5322b;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Avenir Next", "Segoe UI", Roboto, sans-serif;
        color: var(--ink);
        background: linear-gradient(180deg, #ffe9c2 0%, #f7d79f 35%, #f8ead2 100%);
      }
      .wrap { max-width: 820px; margin: 0 auto; padding: 20px 16px 32px; }
      .card {
        background: var(--card);
        border: 1px solid rgba(0, 0, 0, 0.1);
        border-radius: 16px;
        padding: 16px;
      }
      h1 { margin: 0 0 8px; }
      .stack { display: grid; gap: 12px; }
      .grid { display: grid; gap: 8px; grid-template-columns: 1fr 1fr; }
      .row { display: grid; gap: 8px; }
      input[type="text"], input[type="file"] {
        width: 100%;
        min-height: 44px;
        border-radius: 10px;
        border: 1px solid rgba(0, 0, 0, 0.2);
        padding: 10px 12px;
        background: white;
      }
      button {
        width: 100%;
        min-height: 48px;
        border: none;
        border-radius: 12px;
        font-size: 1rem;
        font-weight: 700;
        color: white;
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
        background: #f8fafc;
        border: 1px solid rgba(33,33,33,0.18);
      }
      #result ul { margin: 6px 0 0; padding-left: 20px; }
      .small { font-size: 0.92rem; opacity: 0.86; }
      .nav { margin-top: 12px; }
      .nav a { color: #4e2d1b; text-decoration: none; font-weight: 700; }
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
        --bg: #fcf6ea;
        --ink: #2f1d12;
        --accent: #b95826;
        --card: #fffdf8;
      }
      body { margin: 0; font-family: "Avenir Next", "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--ink); }
      .wrap { max-width: 1100px; margin: 0 auto; padding: 20px 16px 30px; }
      .toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 14px; flex-wrap: wrap; }
      select, button {
        min-height: 40px;
        border-radius: 10px;
        border: 1px solid rgba(0,0,0,0.2);
        padding: 8px 10px;
        background: white;
      }
      button { background: var(--accent); color: white; border: none; font-weight: 700; }
      table {
        width: 100%;
        border-collapse: collapse;
        background: var(--card);
        border-radius: 12px;
        overflow: hidden;
      }
      th, td {
        text-align: left;
        padding: 10px;
        border-bottom: 1px solid rgba(0,0,0,0.08);
        font-size: 0.95rem;
      }
      th { background: #f8e6cd; }
      .muted { opacity: 0.8; font-size: 0.93rem; margin-top: 8px; }
      .links a { color: #4b2a18; text-decoration: none; font-weight: 700; }
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
        --bg: #fbf2e4;
        --card: #fffdf9;
        --ink: #2f1d12;
        --accent: #bc5b29;
      }
      body { margin: 0; font-family: "Avenir Next", "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--ink); }
      .wrap { max-width: 1100px; margin: 0 auto; padding: 20px 16px 28px; }
      .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
      .card { background: var(--card); border: 1px solid rgba(0,0,0,0.12); border-radius: 12px; padding: 12px; }
      .k { font-size: 1.5rem; font-weight: 800; margin-top: 6px; }
      .toolbar { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; align-items: center; }
      button, select {
        min-height: 40px;
        border-radius: 10px;
        border: 1px solid rgba(0,0,0,0.2);
        padding: 8px 10px;
      }
      button { background: var(--accent); color: white; border: none; font-weight: 700; }
      pre {
        background: #fff;
        border: 1px solid rgba(0,0,0,0.1);
        border-radius: 10px;
        padding: 10px;
        white-space: pre-wrap;
      }
      .nav a { text-decoration: none; font-weight: 700; color: #4a2817; }
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
      :root { --bg:#fbf1e2; --card:#fffdf8; --ink:#2c1a10; --accent:#b95a29; }
      body { margin:0; font-family:"Avenir Next","Segoe UI",Roboto,sans-serif; background:var(--bg); color:var(--ink); }
      .wrap { max-width:1200px; margin:0 auto; padding:20px 16px 28px; }
      .toolbar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:12px; }
      button, select { min-height:40px; border-radius:10px; border:1px solid rgba(0,0,0,0.2); padding:8px 10px; }
      button { background:var(--accent); color:white; border:none; font-weight:700; }
      .grid { display:grid; gap:10px; grid-template-columns: 1.2fr 1fr; }
      @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
      .panel { background:var(--card); border:1px solid rgba(0,0,0,0.1); border-radius:12px; padding:12px; }
      table { width:100%; border-collapse:collapse; }
      th, td { text-align:left; padding:8px; border-bottom:1px solid rgba(0,0,0,0.08); font-size:0.93rem; }
      tr.clickable { cursor:pointer; }
      tr.clickable:hover { background:rgba(0,0,0,0.03); }
      pre { white-space:pre-wrap; background:#fff; border:1px solid rgba(0,0,0,0.1); border-radius:10px; padding:10px; }
      .nav a { color:#4a2817; text-decoration:none; font-weight:700; }
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
