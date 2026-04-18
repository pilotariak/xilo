/*
 * SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
 * SPDX-License-Identifier: Apache-2.0
 */

// SPDX-FileCopyrightText: Copyright (C) Nicolas Lamirault <nicolas.lamirault@gmail.com>
// SPDX-License-Identifier: Apache-2.0

import pkg from '../../package.json';

/**
 * Renders the Xilo landing page at GET /.
 * Follows the Pilotariak design system (DESIGN.md):
 * warm cream canvas, Basque red identity, editorial precision.
 */
export function handleLanding(request: Request,): Response {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405, },);
  }

  return new Response(renderHtml(), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', },
  },);
}

function renderHtml(): string {
  return /* html */ `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Xilo — Pilotariak Slack Bot</title>
  <meta name="description" content="Your Basque pelota community assistant. Match info, schedules, and rankings directly in Slack." />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap" rel="stylesheet" />
  <style>
    /* ── Design tokens (DESIGN.md) ───────────────────────────── */
    :root {
      --red:          #C8102E;
      --red-dark:     #970D25;
      --red-soft:     #FDE8EC;
      --cream:        #F7F4EF;
      --card:         #FFFDFC;
      --white:        #FFFFFF;
      --surface-alt:  #F2EDE7;
      --line:         #E5DED6;
      --ink:          #141414;
      --text:         #262626;
      --muted:        #7A7A7A;
      --subtle:       #A8A49E;
      --green:        #1F7A5A;
      --green-soft:   #E6F4EE;
      --panel:        #1E1E1E;
      --shadow:       rgba(103, 18, 31, 0.10);
    }

    /* ── Reset & base ──────────────────────────────────────────── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    html { scroll-behavior: smooth; }

    body {
      font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--cream);
      color: var(--text);
      font-size: 16px;
      line-height: 1.65;
      -webkit-font-smoothing: antialiased;
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { transition: none !important; animation: none !important; }
    }

    /* ── Container ─────────────────────────────────────────────── */
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 80px;
    }
    @media (max-width: 1279px) { .container { padding: 0 48px; } }
    @media (max-width: 1023px) { .container { padding: 0 32px; } }
    @media (max-width: 767px)  { .container { padding: 0 24px; } }

    /* ── Eyebrow label ─────────────────────────────────────────── */
    .eyebrow {
      display: block;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.2;
      letter-spacing: 1.5px;
      text-transform: uppercase;
    }

    /* ── Navigation ────────────────────────────────────────────── */
    .nav {
      position: absolute;
      top: 0; left: 0; right: 0;
      z-index: 10;
      padding: 0 80px;
    }
    @media (max-width: 767px) { .nav { padding: 0 24px; } }

    .nav-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 72px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.15);
    }

    .nav-wordmark {
      font-size: 18px;
      font-weight: 800;
      color: #FFFFFF;
      text-decoration: none;
      letter-spacing: -0.3px;
    }

    .nav-wordmark span {
      color: rgba(255, 255, 255, 0.65);
      font-weight: 500;
      margin-left: 6px;
      font-size: 14px;
    }

    .nav-links {
      display: flex;
      align-items: center;
      gap: 32px;
      list-style: none;
    }
    @media (max-width: 767px) { .nav-links { display: none; } }

    .nav-links a {
      font-size: 15px;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.82);
      text-decoration: none;
      transition: color 150ms ease;
    }
    .nav-links a:hover { color: #FFFFFF; }

    .nav-cta {
      font-size: 14px;
      font-weight: 700;
      color: var(--red);
      background: #FFFFFF;
      border: none;
      border-radius: 8px;
      padding: 10px 20px;
      text-decoration: none;
      transition: background 150ms ease, transform 200ms ease, box-shadow 200ms ease;
    }
    .nav-cta:hover {
      background: var(--cream);
      transform: translateY(-1px);
      box-shadow: 0 4px 16px var(--shadow);
    }

    /* ── Hero ──────────────────────────────────────────────────── */
    .hero {
      position: relative;
      min-height: 480px;
      background: linear-gradient(to bottom, var(--red) 0%, var(--red-dark) 45%, var(--cream) 100%);
      display: flex;
      align-items: flex-end;
      padding-top: 120px;
      padding-bottom: 80px;
      overflow: hidden;
    }
    @media (max-width: 767px) {
      .hero { min-height: 320px; padding-top: 80px; padding-bottom: 48px; }
    }

    /* Decorative translucent circles */
    .hero::before,
    .hero::after {
      content: '';
      position: absolute;
      border-radius: 9999px;
      background: rgba(255, 255, 255, 0.07);
      pointer-events: none;
    }
    .hero::before { width: 480px; height: 480px; top: -120px; right: -80px; }
    .hero::after  { width: 320px; height: 320px; top: 60px; right: 160px; }

    .hero-content {
      position: relative;
      z-index: 1;
      max-width: 800px;
    }

    .hero-eyebrow {
      color: rgba(255, 255, 255, 0.75);
      margin-bottom: 16px;
    }

    .hero-title {
      font-size: 64px;
      font-weight: 900;
      line-height: 1.0;
      letter-spacing: -1.5px;
      color: #FFFFFF;
      margin-bottom: 20px;
    }
    @media (max-width: 767px) {
      .hero-title { font-size: 36px; letter-spacing: -0.8px; }
    }
    @media (max-width: 1023px) {
      .hero-title { font-size: 48px; letter-spacing: -1px; }
    }

    .hero-subtitle {
      font-size: 18px;
      font-weight: 400;
      line-height: 1.7;
      color: rgba(255, 255, 255, 0.82);
      max-width: 560px;
      margin-bottom: 36px;
    }

    .hero-actions {
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }

    .btn-primary {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 16px;
      font-weight: 700;
      line-height: 1;
      color: var(--red);
      background: #FFFFFF;
      border: none;
      border-radius: 8px;
      padding: 14px 28px;
      text-decoration: none;
      cursor: pointer;
      transition: background 150ms ease, transform 200ms ease, box-shadow 200ms ease;
    }
    .btn-primary:hover {
      background: var(--cream);
      transform: translateY(-1px);
      box-shadow: 0 4px 16px var(--shadow);
    }
    .btn-primary:active { transform: scale(0.98); }

    .btn-secondary {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 16px;
      font-weight: 700;
      line-height: 1;
      color: rgba(255, 255, 255, 0.82);
      background: transparent;
      border: 2px solid rgba(255, 255, 255, 0.35);
      border-radius: 8px;
      padding: 12px 26px;
      text-decoration: none;
      cursor: pointer;
      transition: border-color 150ms ease, color 150ms ease, background 150ms ease;
    }
    .btn-secondary:hover {
      border-color: rgba(255, 255, 255, 0.70);
      color: #FFFFFF;
      background: rgba(255, 255, 255, 0.08);
    }

    /* ── Section shell ─────────────────────────────────────────── */
    .section {
      padding: 80px 0;
    }
    @media (max-width: 767px) { .section { padding: 48px 0; } }

    .section-alt { background: var(--surface-alt); }

    /* ── Section header ─────────────────────────────────────────── */
    .section-header {
      max-width: 640px;
      margin-bottom: 48px;
    }

    .section-header .eyebrow {
      color: var(--muted);
      margin-bottom: 8px;
    }

    .section-title {
      font-size: 40px;
      font-weight: 800;
      line-height: 1.1;
      letter-spacing: -0.5px;
      color: var(--ink);
      margin-bottom: 16px;
    }
    @media (max-width: 767px) { .section-title { font-size: 28px; } }

    .section-subtitle {
      font-size: 18px;
      font-weight: 400;
      line-height: 1.7;
      color: var(--muted);
    }

    /* ── Feature cards grid ─────────────────────────────────────── */
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
    }
    @media (max-width: 1023px) { .cards-grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 639px)  { .cards-grid { grid-template-columns: 1fr; } }

    .card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 24px;
      transition: border-color 150ms ease, box-shadow 150ms ease;
    }
    .card:hover {
      border-color: var(--red);
      box-shadow: 0 4px 12px rgba(103, 18, 31, 0.07);
    }

    .card-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border-radius: 10px;
      background: var(--red-soft);
      color: var(--red-dark);
      font-size: 20px;
      margin-bottom: 16px;
    }

    .card-title {
      font-size: 18px;
      font-weight: 700;
      line-height: 1.3;
      color: var(--ink);
      margin-bottom: 8px;
    }

    .card-body {
      font-size: 15px;
      font-weight: 400;
      line-height: 1.6;
      color: var(--muted);
    }

    /* ── Command list ─────────────────────────────────────────── */
    .commands-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .command-row {
      display: flex;
      align-items: flex-start;
      gap: 20px;
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 20px 24px;
      transition: border-color 150ms ease;
    }
    .command-row:hover { border-color: var(--red); }

    .command-chip {
      flex-shrink: 0;
      font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
      font-size: 14px;
      font-weight: 600;
      color: var(--red-dark);
      background: var(--red-soft);
      border-radius: 6px;
      padding: 4px 10px;
      line-height: 1.6;
      white-space: nowrap;
    }

    .command-desc {
      font-size: 15px;
      font-weight: 400;
      line-height: 1.6;
      color: var(--text);
    }

    .command-desc strong {
      font-weight: 600;
      color: var(--ink);
      display: block;
      margin-bottom: 2px;
    }

    /* ── Setup steps ────────────────────────────────────────────── */
    .steps-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
      counter-reset: step;
    }
    @media (max-width: 767px) { .steps-grid { grid-template-columns: 1fr; } }

    .step {
      position: relative;
      padding: 28px 24px;
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 12px;
      counter-increment: step;
    }

    .step::before {
      content: counter(step);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 9999px;
      background: var(--red);
      color: #FFFFFF;
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 16px;
    }

    .step-title {
      font-size: 17px;
      font-weight: 700;
      color: var(--ink);
      margin-bottom: 8px;
    }

    .step-body {
      font-size: 14px;
      line-height: 1.6;
      color: var(--muted);
    }

    .step-code {
      display: inline-block;
      margin-top: 10px;
      font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
      font-size: 13px;
      font-weight: 600;
      color: var(--red-dark);
      background: var(--red-soft);
      border-radius: 6px;
      padding: 4px 10px;
    }

    /* ── Badge ─────────────────────────────────────────────────── */
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border-radius: 9999px;
      padding: 5px 12px;
      font-size: 12px;
      font-weight: 700;
    }
    .badge-green {
      background: var(--green-soft);
      color: var(--green);
    }
    .badge-dot {
      width: 6px; height: 6px;
      border-radius: 9999px;
      background: currentColor;
    }

    /* ── Footer ─────────────────────────────────────────────────── */
    footer {
      background: var(--ink);
      padding: 64px 0;
    }
    @media (max-width: 767px) { footer { padding: 48px 0; } }

    .footer-inner {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 48px;
    }
    @media (max-width: 767px) { .footer-inner { grid-template-columns: 1fr; gap: 32px; } }

    .footer-brand .wordmark {
      font-size: 22px;
      font-weight: 800;
      color: var(--cream);
      letter-spacing: -0.3px;
      margin-bottom: 12px;
    }

    .footer-brand p {
      font-size: 14px;
      line-height: 1.6;
      color: var(--subtle);
      max-width: 240px;
    }

    .footer-col-title {
      font-size: 12px;
      font-weight: 700;
      color: var(--cream);
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 16px;
    }

    .footer-links {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .footer-links a {
      font-size: 14px;
      font-weight: 400;
      color: var(--subtle);
      text-decoration: none;
      transition: color 150ms ease;
    }
    .footer-links a:hover { color: var(--cream); }

    .footer-bottom {
      margin-top: 48px;
      padding-top: 24px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
    }

    .footer-bottom p {
      font-size: 13px;
      color: var(--subtle);
    }

    .footer-bottom a {
      color: var(--subtle);
      text-decoration: none;
      transition: color 150ms ease;
    }
    .footer-bottom a:hover { color: var(--cream); }

    /* ── Focus ring ─────────────────────────────────────────────── */
    :focus-visible {
      outline: 2px solid var(--red);
      outline-offset: 3px;
      border-radius: 4px;
      box-shadow: 0 0 0 3px rgba(200, 16, 46, 0.12);
    }
  </style>
</head>
<body>

  <!-- Navigation -->
  <nav class="nav" aria-label="Main navigation">
    <div class="nav-inner">
      <a href="/" class="nav-wordmark">
        Pilotariak<span>/ Xilo</span>
      </a>
      <ul class="nav-links" role="list">
        <li><a href="#commands">Commands</a></li>
        <li><a href="#setup">Setup</a></li>
        <li><a href="https://github.com/Pilotariak/xilo">GitHub</a></li>
      </ul>
      <a href="https://github.com/Pilotariak/xilo" class="nav-cta">GitHub</a>
    </div>
  </nav>

  <!-- Hero -->
  <header class="hero" role="banner">
    <div class="container">
      <div class="hero-content">
        <span class="eyebrow hero-eyebrow">Pilotariak Slack Bot</span>
        <h1 class="hero-title">Xilo</h1>
        <p class="hero-subtitle">
          Your Basque pelota community assistant — match schedules, rankings,
          and team updates delivered directly where your community talks.
        </p>
        <div class="hero-actions">
          <a href="https://github.com/Pilotariak/xilo" class="btn-primary">
            View on GitHub
          </a>
        </div>
      </div>
    </div>
  </header>

  <main>

    <!-- Features -->
    <section class="section" id="features" aria-labelledby="features-title">
      <div class="container">
        <header class="section-header">
          <span class="eyebrow">Why Xilo</span>
          <h2 class="section-title" id="features-title">Built for the Pilotariak community</h2>
          <p class="section-subtitle">
            Xilo speaks your language — Basque pelota schedules, results, and community
            coordination without leaving Slack.
          </p>
        </header>
        <div class="cards-grid" role="list">
          <article class="card" role="listitem">
            <div class="card-icon" aria-hidden="true">🏟️</div>
            <h3 class="card-title">Match Information</h3>
            <p class="card-body">
              Instant access to upcoming matches, current standings, and live
              results for every category and fronton.
            </p>
          </article>
          <article class="card" role="listitem">
            <div class="card-icon" aria-hidden="true">📅</div>
            <h3 class="card-title">Schedule at a Glance</h3>
            <p class="card-body">
              Never miss a game. Fetch the week's schedule directly in your
              channel so the whole team stays coordinated.
            </p>
          </article>
          <article class="card" role="listitem">
            <div class="card-icon" aria-hidden="true">⚡</div>
            <h3 class="card-title">Always On</h3>
            <p class="card-body">
              Globally distributed, always available, zero maintenance
              for your community.
            </p>
          </article>
        </div>
      </div>
    </section>

    <!-- Commands -->
    <section class="section section-alt" id="commands" aria-labelledby="commands-title">
      <div class="container">
        <header class="section-header">
          <span class="eyebrow">Slash Commands</span>
          <h2 class="section-title" id="commands-title">Everything starts with <code style="font-size:0.85em;background:var(--red-soft);color:var(--red-dark);border-radius:6px;padding:2px 8px;">/xilo</code></h2>
          <p class="section-subtitle">
            Simple, composable commands. Type them in any channel where Xilo is invited.
          </p>
        </header>
        <div class="commands-list" role="list">
          <div class="command-row" role="listitem">
            <span class="command-chip">/xilo help</span>
            <div class="command-desc">
              <strong>Show all commands</strong>
              Returns the full list of available subcommands — only visible to you.
            </div>
          </div>
          <div class="command-row" role="listitem">
            <span class="command-chip">/xilo ping</span>
            <div class="command-desc">
              <strong>Health check</strong>
              Confirms the bot is live and responding. Posted to the channel so everyone can see.
            </div>
          </div>
          <div class="command-row" role="listitem">
            <span class="command-chip">/xilo hello [message]</span>
            <div class="command-desc">
              <strong>Greet the channel</strong>
              Posts a friendly greeting with your optional message. Great for announcements.
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Setup -->
    <section class="section" id="setup" aria-labelledby="setup-title">
      <div class="container">
        <header class="section-header">
          <span class="eyebrow">Get Started</span>
          <h2 class="section-title" id="setup-title">Up and running in three steps</h2>
        </header>
        <div class="steps-grid">
          <article class="step">
            <h3 class="step-title">Install the app</h3>
            <p class="step-body">
              Ask your workspace admin to install Xilo for your workspace.
              Takes under a minute.
            </p>
          </article>
          <article class="step">
            <h3 class="step-title">Invite to a channel</h3>
            <p class="step-body">
              Open any channel and type:
            </p>
            <code class="step-code">@xilo</code>
          </article>
          <article class="step">
            <h3 class="step-title">Start using commands</h3>
            <p class="step-body">
              Try your first command to see Xilo in action.
            </p>
            <code class="step-code">/xilo help</code>
          </article>
        </div>
      </div>
    </section>

    <!-- Status strip -->
    <section class="section section-alt" aria-label="Bot status">
      <div class="container" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;">
        <div>
          <span class="eyebrow" style="color:var(--muted);margin-bottom:6px;">Current status</span>
          <p style="font-size:18px;font-weight:700;color:var(--ink);">All systems operational</p>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          <span class="badge badge-green">
            <span class="badge-dot" aria-hidden="true"></span>
            Live
          </span>
          <span style="font-size:14px;color:var(--muted);">v${pkg.version}</span>
        </div>
      </div>
    </section>

  </main>

  <!-- Footer -->
  <footer role="contentinfo">
    <div class="container">
      <div class="footer-inner">
        <div class="footer-brand">
          <p class="wordmark">Pilotariak</p>
          <p>Open source tools for the Basque pelota community. Built with care, run at the edge.</p>
        </div>
        <div>
          <p class="footer-col-title">Project</p>
          <ul class="footer-links" role="list">
            <li><a href="https://github.com/Pilotariak/xilo">GitHub Repository</a></li>
            <li><a href="https://github.com/Pilotariak/xilo/blob/main/CONTRIBUTING.md">Contributing</a></li>
            <li><a href="https://github.com/Pilotariak/xilo/blob/main/LICENSE">Apache-2.0 License</a></li>
            <li><a href="/version">API Version</a></li>
          </ul>
        </div>
        <div>
          <p class="footer-col-title">Community</p>
          <ul class="footer-links" role="list">
            <li><a href="https://github.com/Pilotariak">Pilotariak on GitHub</a></li>
            <li><a href="https://github.com/Pilotariak/xilo/issues">Report an issue</a></li>
            <li><a href="https://github.com/Pilotariak/xilo/blob/main/SECURITY.md">Security</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <p>© 2026 Pilotariak · <a href="https://github.com/Pilotariak/xilo/blob/main/LICENSE">Apache-2.0</a></p>
        <p>Open source · <a href="https://github.com/Pilotariak/xilo">github.com/Pilotariak/xilo</a></p>
      </div>
    </div>
  </footer>

</body>
</html>`;
}
