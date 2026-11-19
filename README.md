<p align="center">
  <img src="docs/readme-banner.svg" width="1200" alt="UM-PASS Survey Filler clipboard logo and name, with an example 4 and 5 rating pattern">
</p>

<h1 align="center">UM-PASS Survey Filler</h1>

<p align="center">A minimalist, local-only Chrome and Edge extension that pre-fills supported <a href="https://umpass.umindanao.edu.ph/feedback-form/">UM-PASS</a> surveys and evaluations so you can review them and submit them yourself.</p>

<p align="center"><code>Version 1.2.1</code> &nbsp; <code>Chrome · Edge · Manifest V3</code> &nbsp; <code>Vanilla JavaScript</code> &nbsp; <code>Runs locally</code></p>

<p align="center">
  <a href="#install-or-update"><img src="docs/install-button.svg" width="216" alt="Install guide"></a>
  <br>
  <sub>Load it unpacked in a few steps. It never submits a form for you.</sub>
</p>

<p align="center">
  <a href="#at-a-glance"><strong>At a glance</strong></a> &nbsp;·&nbsp;
  <a href="#install-or-update"><strong>Install</strong></a> &nbsp;·&nbsp;
  <a href="#supports"><strong>Supports</strong></a> &nbsp;·&nbsp;
  <a href="#important-limits"><strong>Important limits</strong></a>
</p>

## At a glance

<table>
  <tr>
    <td align="center" width="25%"><strong>01 · Fill</strong><br><sub>Randomized 4/5 rating mix on five-point scales</sub></td>
    <td align="center" width="25%"><strong>02 · Match</strong><br><sub>Context-aware college and venue options</sub></td>
    <td align="center" width="25%"><strong>03 · Comment</strong><br><sub>Your own text in labeled comment fields</sub></td>
    <td align="center" width="25%"><strong>04 · Review</strong><br><sub>You check every answer and press Submit</sub></td>
  </tr>
</table>

## Install or update

1. Download or clone this repository (or extract its release ZIP).
2. Open `chrome://extensions` (`edge://extensions` in Edge), and enable **Developer mode**.
3. If you previously installed the extension, click **Remove** on the old copy (or replace the contents of the original unpacked folder, then press **Reload**).
4. Click **Load unpacked** and select the extracted `um-pass-survey-filler` directory containing `manifest.json`.
5. Open UM-PASS, then one of the three supported sections. Click the entry's **Answer Survey / Evaluation** link; on the individual form open the extension and choose **Fill unanswered questions**.
6. Review all questions and press **Submit** yourself.

## Supports

- **Survey** (`/feedback-form/survey`) list and available individual forms.
- **Course Delivery Evaluation** (`/feedback-form/course-assessment`) list and 1–5 rating groups (37 question group layout verified against supplied HTML).
- **Performance Evaluation** (`/feedback-form/evaluation`) list and compatible individual forms.
- Automatic 4/5 randomized rating mix on detected five-point numeric / label rating scales; never assigns 1, 2, or 3.
- Skip already selected ratings; use the existing form UI's click events so reactive forms receive changes.
- **Smart location matching:** favor a laboratory for clearly lab-related venue questions and a gym for clearly sports-related venue questions, only if that option appears. College, campus, and uncertain locations are left blank for review. Select **Prefer CCE** to fill a college question with CCE when that option appears; other location settings can prefer Gym or skip location filling.
- Optional user-authored comment in clearly designated comment fields.
- **Auto-fill** can fill newly opened forms, but cannot submit them.
- Quick-access buttons for Survey, Course Delivery, and Performance sections.

## Important limits

The supplied HTML for **Survey Form** and **Performance Evaluation** captures listing pages (not individual question forms). Therefore some question types and layouts may not be recognized; this is best-effort, not guaranteed to fill all fields. Locked or completed forms are not changed. No hidden API calls, authentication handling, or automatic submission. The extension does not browse every pending survey on your behalf. Verify campus, building, and venue responses, because the actual location cannot be known from the saved listing pages. Ratings are only a *draft pattern*; change any to reflect your genuine evaluation before submission.

All configuration remains in your browser's extension storage. No separate network requests. Not affiliated with UM.

## Checks

Run `node --test` to check rating grouping and location answer preservation. The tests use Node's built-in test runner and need no packages.
