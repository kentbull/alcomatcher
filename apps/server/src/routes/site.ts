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
        --ok: #1f7a44;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Avenir Next", "Segoe UI", Roboto, sans-serif;
        color: var(--ink);
        background: linear-gradient(180deg, #ffe9c2 0%, #f7d79f 35%, #f8ead2 100%);
      }
      .wrap { max-width: 740px; margin: 0 auto; padding: 20px 16px 32px; }
      .card {
        background: var(--card);
        border: 1px solid rgba(0, 0, 0, 0.1);
        border-radius: 16px;
        padding: 16px;
      }
      h1 { margin: 0 0 8px; }
      p { margin: 0 0 14px; }
      .stack { display: grid; gap: 12px; }
      input[type="file"] { width: 100%; }
      input[type="text"] {
        width: 100%;
        min-height: 44px;
        border-radius: 10px;
        border: 1px solid rgba(0, 0, 0, 0.2);
        padding: 10px 12px;
        background: white;
      }
      button {
        width: 100%;
        min-height: 50px;
        border: none;
        border-radius: 12px;
        font-size: 1rem;
        font-weight: 700;
        color: white;
        background: var(--accent);
      }
      #preview { max-width: 100%; border-radius: 12px; display: none; }
      #result {
        display: none;
        margin-top: 10px;
        padding: 12px;
        border-radius: 12px;
        background: #eaf8ee;
        border: 1px solid rgba(31, 122, 68, 0.25);
      }
      #result strong { color: var(--ok); }
      .small { font-size: 0.92rem; opacity: 0.85; }
      .nav { margin-top: 12px; }
      .nav a { color: #4e2d1b; text-decoration: none; font-weight: 700; }
    </style>
  </head>
  <body>
    <main class="wrap">
      <section class="card stack">
        <h1>Scanner</h1>
        <p>Capture a label photo and run a quick compliance check.</p>
        <input id="expectedBrandName" type="text" placeholder="Expected Brand Name (optional)" />
        <input id="expectedClassType" type="text" placeholder="Expected Class/Type (optional)" />
        <input id="expectedAbvText" type="text" placeholder="Expected ABV (e.g. 45% Alc./Vol.) (optional)" />
        <input id="expectedNetContents" type="text" placeholder="Expected Net Contents (e.g. 750 mL) (optional)" />
        <input id="photo" type="file" accept="image/*" capture="environment" />
        <img id="preview" alt="Label preview" />
        <button id="runCheck" type="button">Run Quick Check</button>
        <div id="result"></div>
        <div class="small">This is the first mobile workflow slice. Full OCR/rules engine is next.</div>
      </section>
      <div class="nav"><a href="/">← Back to Home</a></div>
    </main>
    <script>
      const photoInput = document.getElementById("photo");
      const preview = document.getElementById("preview");
      const runBtn = document.getElementById("runCheck");
      const result = document.getElementById("result");
      const expectedBrandNameInput = document.getElementById("expectedBrandName");
      const expectedClassTypeInput = document.getElementById("expectedClassType");
      const expectedAbvTextInput = document.getElementById("expectedAbvText");
      const expectedNetContentsInput = document.getElementById("expectedNetContents");
      let selectedFile = null;

      function renderError(message) {
        result.style.display = "block";
        result.style.background = "#fff1ef";
        result.style.borderColor = "rgba(175,45,24,0.25)";
        result.innerHTML = "<strong>Check failed.</strong> " + message;
      }

      function mapScannerError(payload, statusCode) {
        if (payload && payload.error === "photo_too_large") {
          return "Image is too large. Please choose a photo under 12MB.";
        }
        if (statusCode === 413) {
          return "Image is too large for upload. Please retry with a smaller image.";
        }
        if (payload && payload.error === "photo_required") {
          return "Capture or upload a label first.";
        }
        const requestRef = payload && payload.request_id ? " (ref: " + payload.request_id + ")" : "";
        if (payload && payload.detail) return payload.detail + requestRef;
        if (payload && payload.error) return payload.error + requestRef;
        return "Try again in a few seconds.";
      }

      function renderResult(scan) {
        const statusColor =
          scan.summary === "pass"
            ? "#1f7a44"
            : scan.summary === "fail"
              ? "#9b2c20"
              : "#9a6b12";

        const checksHtml = scan.checks
          .map((check) => {
            return (
              "<li><strong>" + check.label + ":</strong> " +
              check.status.toUpperCase() + " - " + check.detail + "</li>"
            );
          })
          .join("");

        result.style.display = "block";
        result.style.background = "#f8fafc";
        result.style.borderColor = "rgba(33,33,33,0.18)";
        result.innerHTML =
          "<div><strong style='color:" + statusColor + "'>Summary: " + scan.summary.toUpperCase() + "</strong></div>" +
          "<div>Application ID: " + (scan.applicationId || "n/a") + "</div>" +
          "<div style='margin-top:6px'>Confidence: " + Math.round((scan.confidence || 0) * 100) + "%</div>" +
          "<div>Provider: " + scan.provider + (scan.usedFallback ? " (fallback used)" : "") + "</div>" +
          "<div style='margin-top:8px'><strong>Detected Fields</strong></div>" +
          "<div>Brand: " + (scan.extracted.brandName || "not detected") + "</div>" +
          "<div>Class/Type: " + (scan.extracted.classType || "not detected") + "</div>" +
          "<div>ABV: " + (scan.extracted.abvText || "not detected") + "</div>" +
          "<div>Net Contents: " + (scan.extracted.netContents || "not detected") + "</div>" +
          "<div>Gov Warning: " + (scan.extracted.hasGovWarning ? "detected" : "not detected") + "</div>" +
          "<div style='margin-top:8px'><strong>Checks</strong></div>" +
          "<ul style='padding-left:20px; margin:6px 0 0'>" + checksHtml + "</ul>" +
          "<details style='margin-top:8px'><summary>Raw OCR Text</summary><pre style='white-space:pre-wrap'>" +
          (scan.extracted.rawText || "").slice(0, 1500).replace(/</g, "&lt;") +
          "</pre></details>";
      }

      photoInput.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        if (file.size > 12 * 1024 * 1024) {
          selectedFile = null;
          preview.style.display = "none";
          renderError("Image is too large. Please use a photo under 12MB.");
          return;
        }
        selectedFile = file;
        preview.src = URL.createObjectURL(file);
        preview.style.display = "block";
        result.style.display = "none";
      });

      runBtn.addEventListener("click", async () => {
        if (!selectedFile) {
          renderError("Capture or upload a label first.");
          return;
        }

        runBtn.disabled = true;
        runBtn.textContent = "Checking...";

        try {
          const formData = new FormData();
          formData.append("photo", selectedFile);
          if (expectedBrandNameInput.value.trim()) formData.append("expectedBrandName", expectedBrandNameInput.value.trim());
          if (expectedClassTypeInput.value.trim()) formData.append("expectedClassType", expectedClassTypeInput.value.trim());
          if (expectedAbvTextInput.value.trim()) formData.append("expectedAbvText", expectedAbvTextInput.value.trim());
          if (expectedNetContentsInput.value.trim()) formData.append("expectedNetContents", expectedNetContentsInput.value.trim());
          formData.append("requireGovWarning", "true");

          const scanRes = await fetch("/api/scanner/quick-check", {
            method: "POST",
            body: formData
          });

          if (!scanRes.ok) {
            const payload = await scanRes.json().catch(() => ({}));
            throw new Error(mapScannerError(payload, scanRes.status));
          }

          const scan = await scanRes.json();
          renderResult(scan);
        } catch (error) {
          renderError((error && error.message) ? error.message : "Try again in a few seconds.");
        } finally {
          runBtn.disabled = false;
          runBtn.textContent = "Run Quick Check";
        }
      });
    </script>
  </body>
</html>`);
});
