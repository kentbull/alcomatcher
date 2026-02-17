import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

export const siteRouter = Router();

function requireManagerHtml(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser) {
    return res.status(401).type("html").send("<h1>401 Unauthorized</h1><p>Sign in as a compliance manager to access this page.</p>");
  }
  if (req.authUser.role !== "compliance_manager") {
    return res.status(403).type("html").send("<h1>403 Forbidden</h1><p>Compliance manager access required.</p>");
  }
  next();
}

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
        <a class="btn btn-secondary" href="/login">Sign In</a>
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

siteRouter.get("/login", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AlcoMatcher Sign In</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: "Avenir Next", "Segoe UI", "Trebuchet MS", sans-serif;
        background: linear-gradient(165deg, #6f4f37 0%, #5a3c2d 36%, #3f2d24 72%, #2f211a 100%);
        color: #f6e7cf;
      }
      .card {
        width: min(92vw, 420px);
        background: rgba(22, 14, 10, 0.55);
        border: 1px solid rgba(236, 204, 151, 0.22);
        border-radius: 14px;
        padding: 18px;
      }
      h1 { margin: 0 0 10px; }
      p { margin: 0 0 12px; opacity: 0.95; }
      label { display: block; margin: 10px 0 6px; font-weight: 600; }
      input {
        width: 100%;
        min-height: 42px;
        border-radius: 10px;
        border: 1px solid rgba(236, 204, 151, 0.32);
        background: rgba(255, 248, 232, 0.94);
        color: #2f1c14;
        padding: 8px 10px;
      }
      .row { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
      button {
        min-height: 42px;
        border-radius: 10px;
        border: 1px solid rgba(242, 216, 172, 0.2);
        padding: 10px 14px;
        font-weight: 700;
        cursor: pointer;
      }
      .primary { background: linear-gradient(180deg, #e0b56e, #c89242); color: #1e110c; }
      .muted { background: rgba(25, 15, 10, 0.34); color: #ffefcf; }
      .status { margin-top: 12px; min-height: 20px; }
      .code { margin-top: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      a { color: #ffdfab; }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>Sign In</h1>
      <p>Use your compliance role email and OTP code.</p>
      <label for="email">Email</label>
      <input id="email" type="email" autocomplete="email" value="manager@alcomatcher.com" />
      <div class="row">
        <button class="muted" id="requestBtn" type="button">Request OTP</button>
      </div>
      <label for="code">OTP Code</label>
      <input id="code" type="text" inputmode="numeric" autocomplete="one-time-code" />
      <div class="row">
        <button class="primary" id="verifyBtn" type="button">Verify & Sign In</button>
        <a href="/">Back Home</a>
      </div>
      <div class="status" id="status"></div>
      <div class="code" id="debugCode"></div>
    </main>
    <script>
      const emailEl = document.getElementById("email");
      const codeEl = document.getElementById("code");
      const statusEl = document.getElementById("status");
      const debugCodeEl = document.getElementById("debugCode");
      document.getElementById("requestBtn").addEventListener("click", async () => {
        statusEl.textContent = "Requesting OTP...";
        debugCodeEl.textContent = "";
        const response = await fetch("/api/auth/otp/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: emailEl.value.trim() })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          statusEl.textContent = "OTP request failed.";
          return;
        }
        statusEl.textContent = "OTP requested. Check your channel.";
        if (payload.debugCode) {
          debugCodeEl.textContent = "Debug OTP: " + payload.debugCode;
          codeEl.value = payload.debugCode;
        }
      });
      document.getElementById("verifyBtn").addEventListener("click", async () => {
        statusEl.textContent = "Verifying...";
        const response = await fetch("/api/auth/otp/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: emailEl.value.trim(), code: codeEl.value.trim() })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          statusEl.textContent = "Verify failed. Check code and try again.";
          return;
        }
        statusEl.textContent = "Signed in.";
        const role = payload?.user?.role;
        window.location.href = role === "compliance_manager" ? "/admin/queue" : "/scanner";
      });
    </script>
  </body>
</html>`);
});

siteRouter.get("/privacy", (_req, res) => {
  const updatedAt = "February 17, 2026";
  res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AlcoMatcher Privacy Policy</title>
    <meta name="description" content="Privacy Policy for AlcoMatcher." />
    <style>
      :root {
        --ink: #2f1c14;
        --bg: #f8f1e4;
        --card: #fffaf2;
        --line: rgba(62, 36, 21, 0.16);
        --accent: #9c6530;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--ink);
        font: 16px/1.55 "Avenir Next", "Segoe UI", "Trebuchet MS", sans-serif;
      }
      main {
        max-width: 900px;
        margin: 0 auto;
        padding: 28px 20px 40px;
      }
      .card {
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 22px;
      }
      h1 { margin: 0 0 8px; font-size: clamp(1.8rem, 4vw, 2.2rem); }
      h2 { margin: 22px 0 8px; font-size: 1.1rem; color: var(--accent); }
      p { margin: 0 0 10px; }
      ul { margin: 8px 0 12px; padding-left: 20px; }
      a { color: #7f4f26; text-decoration: none; }
      .meta { color: rgba(47, 28, 20, 0.72); margin-bottom: 14px; }
      .nav { margin-top: 18px; }
    </style>
  </head>
  <body>
    <main>
      <article class="card">
        <h1>Privacy Policy</h1>
        <p class="meta">Last updated: ${updatedAt}</p>
        <p>
          This Privacy Policy describes how AlcoMatcher collects, uses, and discloses information when you use our website and mobile applications.
        </p>

        <h2>Information We Collect</h2>
        <ul>
          <li>Images and scan data you submit for compliance checks.</li>
          <li>Device and usage information needed to operate, secure, and improve the service.</li>
          <li>Account and workflow metadata when you authenticate or save scans.</li>
        </ul>

        <h2>How We Use Information</h2>
        <ul>
          <li>To provide label scanning, OCR, matching, and compliance reporting features.</li>
          <li>To support synchronization, reliability, fraud prevention, and service diagnostics.</li>
          <li>To communicate support or operational updates related to your use of the service.</li>
        </ul>

        <h2>Sharing and Disclosure</h2>
        <p>
          We may share information with service providers that help us host, process, or secure the service. We may also disclose information when required by law, legal process, or to protect rights, safety, and integrity.
        </p>

        <h2>Data Retention</h2>
        <p>
          We retain information for as long as reasonably necessary to provide the service, meet legal obligations, resolve disputes, and enforce agreements.
        </p>

        <h2>Security</h2>
        <p>
          We use commercially reasonable administrative, technical, and organizational measures to protect information, but no method of transmission or storage is guaranteed to be fully secure.
        </p>

        <h2>Your Choices</h2>
        <p>
          You may request access, correction, or deletion of applicable data, subject to legal and operational constraints.
        </p>

        <h2>Children's Privacy</h2>
        <p>
          The service is not directed to children under 13, and we do not knowingly collect personal information from children under 13.
        </p>

        <h2>Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. Updated versions will be posted at this URL with a revised effective date.
        </p>

        <h2>Contact</h2>
        <p>
          For privacy questions, contact <a href="mailto:admin@encodible.com">admin@encodible.com</a>.
        </p>
        <p class="nav"><a href="/">Back to Home</a></p>
      </article>
    </main>
  </body>
</html>`);
});

siteRouter.get("/support", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AlcoMatcher Support</title>
    <meta name="description" content="Support contact for AlcoMatcher." />
    <style>
      :root {
        --ink: #2f1c14;
        --bg: #f8f1e4;
        --card: #fffaf2;
        --line: rgba(62, 36, 21, 0.16);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--ink);
        font: 16px/1.5 "Avenir Next", "Segoe UI", "Trebuchet MS", sans-serif;
      }
      main {
        max-width: 760px;
        margin: 0 auto;
        padding: 28px 20px 40px;
      }
      .card {
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 22px;
      }
      h1 { margin: 0 0 10px; font-size: clamp(1.7rem, 4vw, 2rem); }
      p { margin: 0 0 12px; }
      a { color: #7f4f26; text-decoration: none; font-weight: 700; }
      .nav { margin-top: 16px; }
    </style>
  </head>
  <body>
    <main>
      <article class="card">
        <h1>Support</h1>
        <p>
          For all AlcoMatcher support requests, please contact:
          <a href="mailto:admin@encodible.com">admin@encodible.com</a>
        </p>
        <p>We will respond as quickly as possible.</p>
        <p class="nav"><a href="/">Back to Home</a></p>
      </article>
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
      .wrap {
        max-width: 820px;
        margin: 0 auto;
        padding:
          calc(16px + env(safe-area-inset-top))
          16px
          calc(24px + env(safe-area-inset-bottom));
      }
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
      details {
        background: rgba(23, 15, 11, 0.5);
        border: 1px solid rgba(233, 201, 149, 0.2);
        border-radius: 10px;
        padding: 10px;
      }
      summary { cursor: pointer; font-weight: 700; color: #ffe2af; }
      details pre {
        margin-top: 8px;
        white-space: pre-wrap;
        background: #f7efdf;
        border: 1px solid rgba(49,32,23,0.24);
        color: #2f1d13;
        border-radius: 10px;
        padding: 10px;
      }
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

        <details>
          <summary>Advanced Expected Fields (Optional)</summary>
          <div class="grid" style="margin-top:10px">
            <input id="expectedBrandName" type="text" placeholder="Expected Brand Name (optional)" />
            <input id="expectedClassType" type="text" placeholder="Expected Class/Type (optional)" />
          </div>
          <div class="grid" style="margin-top:8px">
            <input id="expectedAbvText" type="text" placeholder="Expected ABV (optional)" />
            <input id="expectedNetContents" type="text" placeholder="Expected Net Contents (optional)" />
          </div>
        </details>

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
        <details id="devPanel" style="display:none">
          <summary>Developer Tools</summary>
          <pre id="devInfo"></pre>
        </details>
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
      const devPanel = document.getElementById("devPanel");
      const devInfo = document.getElementById("devInfo");

      const state = {
        front: null,
        back: null,
        additional: [],
        statuses: {}
      };

      function fileKey(role, index) {
        return role + ":" + index;
      }

      function setStageStatus(status) {
        const files = listFiles();
        files.forEach((entry) => {
          state.statuses[fileKey(entry.role, entry.index)] = status;
        });
      }

      function listFiles() {
        const files = [];
        if (state.front) files.push({ role: "front", index: 0, file: state.front, status: state.statuses[fileKey("front", 0)] || "ready" });
        if (state.back) files.push({ role: "back", index: 0, file: state.back, status: state.statuses[fileKey("back", 0)] || "ready" });
        state.additional.forEach((file, index) =>
          files.push({
            role: "additional #" + (index + 1),
            index,
            file,
            status: state.statuses[fileKey("additional #" + (index + 1), index)] || "ready"
          })
        );
        return files;
      }

      function renderPreviews() {
        const files = listFiles();
        thumbs.innerHTML = files.map((entry) => {
          const url = URL.createObjectURL(entry.file);
          return "<div class='thumb " + entry.status + "'><img src='" + url + "' alt='preview' /><div class='meta'>" + entry.role + " · " + entry.status.toUpperCase() + "</div></div>";
        }).join("");

        uploadList.innerHTML = files.length
          ? files.map((entry) => "<li>" + entry.role + ": " + entry.status.toUpperCase() + "</li>").join("")
          : "<li>No images selected yet.</li>";
      }

      function renderError(message) {
        result.style.display = "block";
        result.style.background = "#fff1ef";
        result.style.borderColor = "rgba(175,45,24,0.25)";
        result.innerHTML = "<strong>Check failed:</strong> " + message;
      }

      function mapScannerError(payload, statusCode) {
        let message = "Try again in a few seconds.";
        if (payload && payload.error === "photo_too_large") message = "One or more images are larger than 12MB.";
        else if (payload && payload.error === "front_photo_required") message = "Front label photo is required.";
        else if (payload && payload.error === "back_photo_required") message = "Back label photo is required.";
        else if (statusCode === 413) message = "Image upload too large. Retry with smaller images.";
        else if (payload && payload.detail) message = payload.detail;
        else if (payload && payload.error) message = payload.error;
        return { message, requestId: payload && payload.request_id ? payload.request_id : null };
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
        state.statuses[fileKey("front", 0)] = "ready";
        renderPreviews();
      });

      backInput.addEventListener("change", (event) => {
        state.back = event.target.files && event.target.files[0] ? event.target.files[0] : null;
        state.statuses[fileKey("back", 0)] = "ready";
        renderPreviews();
      });

      additionalInput.addEventListener("change", (event) => {
        state.additional = Array.from(event.target.files || []).slice(0, 4);
        state.additional.forEach((_file, index) => {
          state.statuses[fileKey("additional #" + (index + 1), index)] = "ready";
        });
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
        if (devPanel) devPanel.style.display = "none";
        setStageStatus("uploading");
        renderPreviews();

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
            const mapped = mapScannerError(payload, scanRes.status);
            if (devPanel && devInfo && mapped.requestId) {
              devPanel.style.display = "block";
              devInfo.textContent = "request_id: " + mapped.requestId + "\\nerror: " + (payload.error || "unknown");
            }
            throw new Error(mapped.message);
          }

          setStageStatus("processing");
          renderPreviews();
          const scan = await scanRes.json();
          setStageStatus("ready");
          renderPreviews();
          if (devPanel && devInfo) {
            devPanel.style.display = "block";
            devInfo.textContent = "application_id: " + (scan.applicationId || "n/a") + "\\nrequest_id: " + (scan.request_id || "n/a");
          }
          renderResult(scan);
        } catch (error) {
          setStageStatus("failed");
          renderPreviews();
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
siteRouter.get("/admin/queue", requireManagerHtml, (_req, res) => {
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
      .wrap {
        max-width: 1100px;
        margin: 0 auto;
        padding:
          calc(16px + env(safe-area-inset-top))
          16px
          calc(24px + env(safe-area-inset-bottom));
      }
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
      .table-wrap { overflow-x: auto; border-radius: 12px; }
      .muted { opacity: 0.9; font-size: 0.93rem; margin-top: 8px; color: rgba(247, 232, 205, 0.84); }
      .loading {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
        color: #ffe2ae;
      }
      .spinner {
        width: 14px;
        height: 14px;
        border-radius: 999px;
        border: 2px solid rgba(255, 232, 194, 0.35);
        border-top-color: #f4c06f;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      .err {
        display: none;
        margin-bottom: 10px;
        padding: 10px;
        border-radius: 10px;
        background: rgba(160, 46, 36, 0.2);
        border: 1px solid rgba(194, 75, 63, 0.4);
      }
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
      <div id="loading" class="loading"><span class="spinner" aria-hidden="true"></span><span>Loading queue...</span></div>
      <div id="error" class="err"></div>
      <div class="table-wrap">
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
      </div>
      <p class="muted">Admin view is live-backed by event projections and compliance report endpoints.</p>
      <p class="links"><a href="/">← Back to Home</a></p>
    </main>
    <script>
      const queueRows = document.getElementById("queueRows");
      const loading = document.getElementById("loading");
      const errorBox = document.getElementById("error");
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
            "<td><a href='/admin/report/" + item.applicationId + "'>View Report</a></td>" +
          "</tr>";
        }).join("");
      }

      async function loadQueue() {
        const status = statusFilter.value;
        const url = status ? "/api/admin/queue?status=" + encodeURIComponent(status) : "/api/admin/queue";
        loading.style.display = "inline-flex";
        errorBox.style.display = "none";
        refreshBtn.disabled = true;
        refreshBtn.textContent = "Loading...";
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error("Unable to load queue right now.");
          const payload = await response.json();
          renderRows((payload && payload.queue) ? payload.queue : []);
        } catch (error) {
          queueRows.innerHTML = "<tr><td colspan='7'>Unable to load queue.</td></tr>";
          errorBox.style.display = "block";
          errorBox.innerHTML = "Queue unavailable. <button id='retryQueueBtn' type='button' style='margin-left:8px;min-height:36px;border-radius:8px;border:none;padding:6px 10px;background:#c08a3c;color:#24150d;font-weight:700'>Retry</button>";
          const retryBtn = document.getElementById("retryQueueBtn");
          if (retryBtn) retryBtn.addEventListener("click", loadQueue);
        } finally {
          loading.style.display = "none";
          refreshBtn.disabled = false;
          refreshBtn.textContent = "Refresh Queue";
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

siteRouter.get("/admin/report/:applicationId", requireManagerHtml, (req, res) => {
  const applicationId = req.params.applicationId;
  res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AlcoMatcher Compliance Report</title>
    <style>
      :root {
        --bg: linear-gradient(160deg, #6d4d37 0%, #4f3528 42%, #31231b 100%);
        --card: rgba(24, 15, 11, 0.62);
        --ink: #f3e4c8;
        --accent: #c08a3c;
        --warn: #d8a545;
        --bad: #c24b3f;
        --good: #3f9a5b;
      }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: "Avenir Next", "Segoe UI", "Trebuchet MS", sans-serif; background: var(--bg); color: var(--ink); }
      .wrap {
        max-width: 1100px;
        margin: 0 auto;
        padding:
          calc(16px + env(safe-area-inset-top))
          16px
          calc(24px + env(safe-area-inset-bottom));
      }
      .toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 40px;
        border-radius: 10px;
        border: 1px solid rgba(236, 202, 150, 0.24);
        padding: 8px 12px;
        text-decoration: none;
        color: #24150d;
        background: var(--accent);
        font-weight: 700;
      }
      .btn-muted { background: rgba(255, 250, 242, 0.95); }
      .grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
      .card {
        background: var(--card);
        border: 1px solid rgba(235, 201, 147, 0.22);
        border-radius: 12px;
        padding: 12px;
      }
      h1 { margin: 0 0 6px; color: #ffe5b7; }
      h2 { margin: 0 0 10px; color: #ffdeab; font-size: 1.08rem; }
      .k { font-weight: 800; font-size: 1.3rem; }
      .muted { color: rgba(246, 228, 199, 0.82); }
      .status {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 0.84rem;
        font-weight: 800;
        letter-spacing: 0.02em;
      }
      .status-pass { background: rgba(63,154,91,0.2); color: #b8f3c6; border: 1px solid rgba(63,154,91,0.4); }
      .status-fail { background: rgba(194,75,63,0.2); color: #ffd0ca; border: 1px solid rgba(194,75,63,0.4); }
      .status-review { background: rgba(216,165,69,0.2); color: #ffe7b7; border: 1px solid rgba(216,165,69,0.4); }
      table {
        width: 100%;
        border-collapse: collapse;
        background: var(--card);
        border: 1px solid rgba(233, 201, 146, 0.22);
        border-radius: 12px;
        overflow: hidden;
      }
      th, td { text-align: left; padding: 9px; border-bottom: 1px solid rgba(255,255,255,0.08); font-size: 0.92rem; vertical-align: top; }
      th { background: rgba(225, 181, 110, 0.2); color: #ffe4b1; }
      .table-wrap { overflow-x: auto; border-radius: 12px; }
      details {
        margin-top: 10px;
        background: rgba(23, 15, 11, 0.45);
        border: 1px solid rgba(236, 203, 151, 0.2);
        border-radius: 10px;
        padding: 10px;
      }
      summary { cursor: pointer; font-weight: 700; color: #ffe2af; }
      pre {
        margin: 8px 0 0;
        white-space: pre-wrap;
        background: #f7efdf;
        color: #2f1d13;
        border: 1px solid rgba(49, 32, 23, 0.22);
        border-radius: 10px;
        padding: 10px;
      }
      .loading {
        margin-top: 12px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        color: #ffe3b0;
      }
      .spinner {
        width: 14px;
        height: 14px;
        border-radius: 999px;
        border: 2px solid rgba(255, 232, 194, 0.35);
        border-top-color: #f4c06f;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      .err {
        margin-top: 10px;
        padding: 10px;
        border-radius: 10px;
        background: rgba(160, 46, 36, 0.2);
        border: 1px solid rgba(194, 75, 63, 0.4);
      }
      .nav a { color: #f6ddb2; text-decoration: none; font-weight: 700; }
    </style>
  </head>
  <body>
    <main class="wrap">
      <div class="toolbar">
        <a class="btn btn-muted" href="/admin/queue">Back to Queue</a>
        <button id="refreshBtn" class="btn" type="button">Refresh Report</button>
      </div>
      <h1>Compliance Report</h1>
      <p class="muted">Application: <strong id="appId">${applicationId}</strong></p>
      <div id="loading" class="loading"><span class="spinner" aria-hidden="true"></span><span>Loading report...</span></div>
      <div id="error" class="err" style="display:none"></div>
      <section id="content" style="display:none">
        <section class="grid" id="summaryCards"></section>
        <section style="margin-top:12px">
          <h2>Itemized Compliance Checks</h2>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Check</th>
                  <th>Status</th>
                  <th>Severity</th>
                  <th>Rule</th>
                  <th>Evidence</th>
                  <th>Citation</th>
                  <th>Failure Reason</th>
                </tr>
              </thead>
              <tbody id="checkRows"></tbody>
            </table>
          </div>
        </section>
        <section style="margin-top:12px" class="card">
          <h2>Extracted Fields</h2>
          <div id="extracted"></div>
        </section>
        <section style="margin-top:12px">
          <h2>Event Timeline</h2>
          <div class="table-wrap">
            <table>
              <thead><tr><th>When</th><th>Event</th><th>Notes</th></tr></thead>
              <tbody id="timelineRows"></tbody>
            </table>
          </div>
        </section>
        <details>
          <summary>Developer Tools</summary>
          <p><a id="jsonLink" target="_blank" rel="noreferrer">Open Raw JSON Report</a></p>
          <pre id="rawJson"></pre>
        </details>
      </section>
      <p class="nav" style="margin-top:12px"><a href="/admin/queue">Queue</a> · <a href="/admin/dashboard">Dashboard</a> · <a href="/">Home</a></p>
    </main>
    <script>
      const appId = document.getElementById("appId").textContent;
      const loading = document.getElementById("loading");
      const errorBox = document.getElementById("error");
      const content = document.getElementById("content");
      const refreshBtn = document.getElementById("refreshBtn");
      const summaryCards = document.getElementById("summaryCards");
      const checkRows = document.getElementById("checkRows");
      const extracted = document.getElementById("extracted");
      const timelineRows = document.getElementById("timelineRows");
      const jsonLink = document.getElementById("jsonLink");
      const rawJson = document.getElementById("rawJson");
      let refreshTimer = null;

      function statusClass(value) {
        if (value === "pass" || value === "matched" || value === "approved" || value === "synced") return "status-pass";
        if (value === "fail" || value === "rejected" || value === "sync_failed") return "status-fail";
        return "status-review";
      }

      function badge(value) {
        return "<span class='status " + statusClass(value) + "'>" + String(value || "unknown").toUpperCase() + "</span>";
      }

      function card(label, valueHtml) {
        return "<article class='card'><div class='muted'>" + label + "</div><div class='k'>" + valueHtml + "</div></article>";
      }

      function safe(value) {
        if (value === null || value === undefined || value === "") return "n/a";
        return String(value)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      function render(payload) {
        const report = payload.report || {};
        const latest = report.latestQuickCheck || {};
        const conf = typeof latest.confidence === "number" ? Math.round(latest.confidence * 100) + "%" : "n/a";
        summaryCards.innerHTML =
          card("Decision", badge(report.status || latest.summary || "unknown")) +
          card("Sync State", badge(report.syncState || "unknown")) +
          card("Confidence", conf) +
          card("Generated", safe(report.generatedAt));

        const checks = report.checks || [];
        checkRows.innerHTML = checks.length
          ? checks.map((check) =>
              "<tr>" +
                "<td>" + safe(check.label) + "</td>" +
                "<td>" + badge(check.status) + "</td>" +
                "<td>" + safe(check.severity) + "</td>" +
                "<td>" + safe(check.ruleId) + "</td>" +
                "<td>" + safe(check.evidenceText) + "</td>" +
                "<td>" + safe(check.citationRef) + "</td>" +
                "<td>" + safe(check.failureReason) + "</td>" +
              "</tr>"
            ).join("")
          : "<tr><td colspan='7'>No checks found.</td></tr>";

        const fields = report.extracted || {};
        extracted.innerHTML =
          "<div>Brand: <strong>" + safe(fields.brandName) + "</strong></div>" +
          "<div>Class/Type: <strong>" + safe(fields.classType) + "</strong></div>" +
          "<div>ABV: <strong>" + safe(fields.abvText) + "</strong></div>" +
          "<div>Net Contents: <strong>" + safe(fields.netContents) + "</strong></div>" +
          "<div>Government Warning: <strong>" + (fields.hasGovWarning ? "detected" : "not detected") + "</strong></div>";

        const events = report.eventTimeline || [];
        timelineRows.innerHTML = events.length
          ? events.map((event) => {
              const notes = event.eventType === "ScannerQuickCheckRecorded"
                ? "Summary: " + safe(event.payload && event.payload.summary) + "; Confidence: " + safe(event.payload && event.payload.confidence)
                : "Keys: " + Object.keys(event.payload || {}).join(", ");
              return "<tr><td>" + safe(event.createdAt) + "</td><td>" + safe(event.eventType) + "</td><td>" + safe(notes) + "</td></tr>";
            }).join("")
          : "<tr><td colspan='3'>No events found.</td></tr>";

        jsonLink.href = "/api/applications/" + encodeURIComponent(appId) + "/report";
        rawJson.textContent = JSON.stringify(payload, null, 2);
      }

      async function loadReport() {
        loading.style.display = "inline-flex";
        errorBox.style.display = "none";
        content.style.display = "none";
        refreshBtn.disabled = true;
        refreshBtn.textContent = "Loading...";
        try {
          const response = await fetch("/api/applications/" + encodeURIComponent(appId) + "/report");
          if (!response.ok) throw new Error("Unable to load report.");
          const payload = await response.json();
          render(payload);
          content.style.display = "block";
        } catch (_error) {
          errorBox.style.display = "block";
          errorBox.innerHTML = "Unable to load report right now. <button id='retryBtn' class='btn' type='button' style='margin-left:8px'>Retry</button>";
          const retryBtn = document.getElementById("retryBtn");
          if (retryBtn) retryBtn.addEventListener("click", loadReport);
        } finally {
          loading.style.display = "none";
          refreshBtn.disabled = false;
          refreshBtn.textContent = "Refresh Report";
        }
      }

      function scheduleRefresh() {
        if (refreshTimer) return;
        refreshTimer = setTimeout(() => {
          refreshTimer = null;
          loadReport();
        }, 350);
      }

      refreshBtn.addEventListener("click", loadReport);
      if (typeof EventSource !== "undefined") {
        const events = new EventSource("/api/events/stream?scope=admin&applicationId=" + encodeURIComponent(appId));
        events.addEventListener("application.status_changed", scheduleRefresh);
        events.addEventListener("sync.ack", scheduleRefresh);
      }
      loadReport();
    </script>
  </body>
</html>`);
});

siteRouter.get("/admin/dashboard", requireManagerHtml, (_req, res) => {
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
      details {
        margin-top: 12px;
        background: rgba(24, 15, 11, 0.45);
        border: 1px solid rgba(236, 204, 151, 0.2);
        border-radius: 10px;
        padding: 10px;
      }
      summary { cursor: pointer; font-weight: 700; color: #ffe3af; }
      .nav a { text-decoration: none; font-weight: 700; color: #f3d9ab; }
      .loading {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
        color: #ffe2ae;
      }
      .spinner {
        width: 14px;
        height: 14px;
        border-radius: 999px;
        border: 2px solid rgba(255, 232, 194, 0.35);
        border-top-color: #f4c06f;
        animation: spin 0.8s linear infinite;
      }
      .err {
        display: none;
        margin-bottom: 10px;
        padding: 10px;
        border-radius: 10px;
        background: rgba(160, 46, 36, 0.2);
        border: 1px solid rgba(194, 75, 63, 0.4);
      }
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
      <div id="loading" class="loading"><span class="spinner" aria-hidden="true"></span><span>Loading KPI dashboard...</span></div>
      <div id="error" class="err"></div>
      <section class="cards" id="kpiCards"></section>
      <details>
        <summary>Developer Tools</summary>
        <pre id="raw"></pre>
      </details>
      <p class="nav"><a href="/admin/queue">Open Queue</a> · <a href="/admin/batches">Batch Drill-Down</a> · <a href="/">Home</a></p>
    </main>
    <script>
      const kpiCards = document.getElementById("kpiCards");
      const loading = document.getElementById("loading");
      const errorBox = document.getElementById("error");
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
        const stage = kpis.scanStagePerformance || {};
        const decision = stage.decisionTotalMs || {};
        const frontUpload = stage.frontUploadMs || {};
        const finalize = stage.finalizeMs || {};
        const telemetryQuality = kpis.telemetryQuality || {};
        kpiCards.innerHTML =
          card("Total Applications", kpis.totals.applications) +
          card("Quick Checks", kpis.totals.quickChecks) +
          card("Scan p50 (ms)", kpis.scanPerformance.p50Ms) +
          card("Scan p95 (ms)", kpis.scanPerformance.p95Ms) +
          card("Decision p50 (ms)", decision.p50Ms ?? 0) +
          card("Finalize p95 (ms)", finalize.p95Ms ?? 0) +
          card("Front Upload p50 (ms)", frontUpload.p50Ms ?? 0) +
          card("Fallback Rate", fallbackRate + "%") +
          card("Avg Confidence", avgConfidence + "%") +
          card("Telemetry Complete", telemetryQuality.complete ?? 0) +
          card("Synced", kpis.syncHealth.synced) +
          card("Pending Sync", kpis.syncHealth.pending_sync) +
          card("Sync Failed", kpis.syncHealth.sync_failed);
        raw.textContent = JSON.stringify(kpis, null, 2);
      }

      async function loadKpis() {
        const hours = windowHours.value;
        loading.style.display = "inline-flex";
        errorBox.style.display = "none";
        refreshBtn.disabled = true;
        refreshBtn.textContent = "Loading...";
        try {
          const response = await fetch("/api/admin/kpis?windowHours=" + encodeURIComponent(hours));
          if (!response.ok) throw new Error("Unable to load KPIs.");
          const payload = await response.json();
          render(payload.kpis || {});
        } catch (_error) {
          errorBox.style.display = "block";
          errorBox.innerHTML = "KPI dashboard unavailable. <button id='retryKpiBtn' type='button' style='margin-left:8px;min-height:36px;border-radius:8px;border:none;padding:6px 10px;background:#c08a3c;color:#24150d;font-weight:700'>Retry</button>";
          const retryBtn = document.getElementById("retryKpiBtn");
          if (retryBtn) retryBtn.addEventListener("click", loadKpis);
        } finally {
          loading.style.display = "none";
          refreshBtn.disabled = false;
          refreshBtn.textContent = "Refresh KPIs";
        }
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

siteRouter.get("/admin/batches", requireManagerHtml, (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AlcoMatcher Batch Drill-Down</title>
    <style>
      :root { --bg:linear-gradient(155deg, #6b4b36 0%, #50392b 40%, #30231b 100%); --card:rgba(24,15,11,0.62); --ink:#f4e4c8; --accent:#c08a3c; }
      body { margin:0; font-family:"Avenir Next","Segoe UI","Trebuchet MS",sans-serif; background:var(--bg); color:var(--ink); }
      .wrap {
        max-width:1200px;
        margin:0 auto;
        padding:
          calc(16px + env(safe-area-inset-top))
          16px
          calc(24px + env(safe-area-inset-bottom));
      }
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
      .detail-line { margin-bottom: 6px; color: rgba(247, 231, 204, 0.95); }
      details { margin-top:10px; background:rgba(23,15,11,0.45); border:1px solid rgba(236,203,151,0.2); border-radius:10px; padding:10px; }
      summary { cursor:pointer; font-weight:700; color:#ffe2af; }
      .loading {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
        color: #ffe2ae;
      }
      .spinner {
        width: 14px;
        height: 14px;
        border-radius: 999px;
        border: 2px solid rgba(255, 232, 194, 0.35);
        border-top-color: #f4c06f;
        animation: spin 0.8s linear infinite;
      }
      .err {
        display:none;
        margin-bottom:10px;
        padding:10px;
        border-radius:10px;
        background:rgba(160,46,36,0.2);
        border:1px solid rgba(194,75,63,0.4);
      }
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
      <div id="loading" class="loading"><span class="spinner" aria-hidden="true"></span><span>Loading batches...</span></div>
      <div id="error" class="err"></div>
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
          <div id="itemDetail" class="detail-line">Select a line item to view rich failure reasons and retry history.</div>
          <div id="attempts"></div>
          <details>
            <summary>Developer Tools</summary>
            <pre id="rawItemDetail"></pre>
          </details>
        </article>
      </section>
      <p class="nav"><a href="/admin/queue">Queue</a> · <a href="/admin/dashboard">Dashboard</a> · <a href="/">Home</a></p>
    </main>
    <script>
      const batchSelect = document.getElementById("batchSelect");
      const loading = document.getElementById("loading");
      const errorBox = document.getElementById("error");
      const itemRows = document.getElementById("itemRows");
      const itemDetail = document.getElementById("itemDetail");
      const attempts = document.getElementById("attempts");
      const rawItemDetail = document.getElementById("rawItemDetail");
      const refreshBtn = document.getElementById("refreshBtn");
      let currentBatchId = "";
      let refreshTimer = null;

      function esc(value) {
        return String(value === null || value === undefined ? "" : value)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      async function loadBatches() {
        const response = await fetch("/api/batches?limit=100");
        const payload = await response.json();
        const batches = payload.batches || [];
        batchSelect.innerHTML = batches.map((b) => "<option value='" + esc(b.batchId) + "'>" + esc(b.batchId) + " · " + esc(b.status) + " · " + esc(b.updatedAt) + "</option>").join("");
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
          "<tr class='clickable' data-id='" + esc(item.batchItemId) + "'>" +
            "<td>" + esc(item.clientLabelId) + "</td>" +
            "<td>" + esc(item.imageFilename) + "</td>" +
            "<td>" + esc(item.status) + "</td>" +
            "<td>" + esc(item.retryCount || 0) + "</td>" +
            "<td>" + esc(item.lastErrorCode || "none") + "</td>" +
          "</tr>"
        ).join("");
      }

      async function loadItemDetail(batchItemId) {
        const response = await fetch("/api/batches/" + encodeURIComponent(currentBatchId) + "/items/" + encodeURIComponent(batchItemId));
        const payload = await response.json();
        const item = payload.item || {};
        const attemptList = payload.attempts || [];
        itemDetail.innerHTML =
          "<div class='detail-line'><strong>Client Label:</strong> " + esc(item.clientLabelId || "n/a") + "</div>" +
          "<div class='detail-line'><strong>Filename:</strong> " + esc(item.imageFilename || "n/a") + "</div>" +
          "<div class='detail-line'><strong>Status:</strong> " + esc(item.status || "n/a") + "</div>" +
          "<div class='detail-line'><strong>Retry Count:</strong> " + esc(item.retryCount || 0) + "</div>" +
          "<div class='detail-line'><strong>Error Code:</strong> " + esc(item.lastErrorCode || "none") + "</div>" +
          "<div class='detail-line'><strong>Error Reason:</strong> " + esc(item.errorReason || "none") + "</div>";
        attempts.innerHTML = attemptList.length
          ? "<h4>Attempt History</h4><table><thead><tr><th>#</th><th>Outcome</th><th>Error</th><th>Reason</th><th>When</th></tr></thead><tbody>" +
              attemptList.map((attempt) =>
                "<tr><td>" + esc(attempt.attemptNo) + "</td><td>" + esc(attempt.outcome) + "</td><td>" + esc(attempt.errorCode || "none") + "</td><td>" + esc(attempt.errorReason || "n/a") + "</td><td>" + esc(attempt.createdAt) + "</td></tr>"
              ).join("") +
            "</tbody></table>"
          : "<p class='detail-line'>No attempts recorded.</p>";
        rawItemDetail.textContent = JSON.stringify(payload, null, 2);
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
        loading.style.display = "inline-flex";
        errorBox.style.display = "none";
        refreshBtn.disabled = true;
        refreshBtn.textContent = "Loading...";
        try {
          await loadBatches();
          await loadItems();
          wireRowClicks();
        } catch (_error) {
          errorBox.style.display = "block";
          errorBox.innerHTML = "Batch data unavailable. <button id='retryBatchBtn' type='button' style='margin-left:8px;min-height:36px;border-radius:8px;border:none;padding:6px 10px;background:#c08a3c;color:#24150d;font-weight:700'>Retry</button>";
          const retryBtn = document.getElementById("retryBatchBtn");
          if (retryBtn) retryBtn.addEventListener("click", refreshAll);
        } finally {
          loading.style.display = "none";
          refreshBtn.disabled = false;
          refreshBtn.textContent = "Refresh";
        }
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
