<p align="center">
  <img src="docs/readme-banner.svg" width="1200" alt="UM-PASS Survey Filler clipboard logo and name, with an example 4 and 5 rating pattern">
</p>

<h1 align="center">UM-PASS Survey Filler</h1>

<p align="center">A local-only Chrome and Edge extension that fills supported <a href="https://umpass.umindanao.edu.ph/feedback-form/">UM-PASS</a> surveys and evaluations. Its Start button scans available entries across the three feedback sections, then sends and confirms each recognized form.</p>

<p align="center"><code>Version 1.3.12</code> &nbsp; <code>Chrome · Edge · Manifest V3</code> &nbsp; <code>Vanilla JavaScript</code> &nbsp; <code>Runs locally</code></p>

<p align="center">
  <a href="#install-or-update"><img src="docs/install-button.svg" width="216" alt="Install guide"></a>
  <br>
  <sub>Load it unpacked in a few steps. Start sends answers only when the form and confirmation controls are recognized.</sub>
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
    <td align="center" width="25%"><strong>01 · Fill</strong><br><sub>Alternating 5/4 or 9/10 ratings by scale</sub></td>
    <td align="center" width="25%"><strong>02 · Match</strong><br><sub>Context-aware college and venue options</sub></td>
    <td align="center" width="25%"><strong>03 · Comment</strong><br><sub>Set comments and organization names to “N/A”</sub></td>
    <td align="center" width="25%"><strong>04 · Send</strong><br><sub>Start confirms recognized forms and moves to the next</sub></td>
  </tr>
</table>

## Install or update

1. Download or clone this repository (or extract its release ZIP).
2. Open `chrome://extensions` (`edge://extensions` in Edge), and enable **Developer mode**.
3. If you previously installed the extension, click **Remove** on the old copy (or replace the contents of the original unpacked folder, then press **Reload**).
4. Click **Load unpacked** and select the extracted `um-pass-survey-filler` directory containing `manifest.json`.
5. Open any UM-PASS feedback section or an individual answer form and click **Start all sections**. If an answer form is already open, Start handles it first, then scans Survey, Course, and Performance. Keep the tab open. The popup shows the fixed answers before you start: **CCE Data Communication Laboratory**, **N/A** for comments and organization names, and the rating pattern. Organization membership choices use **N/A** when offered or **No** otherwise. Reopen the extension to see progress or click **Stop automation**.
6. For location preferences, auto-fill, manual filling, or section links, expand **Options and manual tools**. For manual use, open an individual form and click **Fill current form only**, then check the answers and submit it yourself.

If the popup cannot connect after an extension update, reload the unpacked extension and reopen the popup. Version 1.3.12 detects when an open UM-PASS tab still has an older script and asks you to refresh that tab. If Brave blocks access, allow the extension to access `umpass.umindanao.edu.ph` and refresh the tab.

## Supports

- **Survey** (`/feedback-form/survey`) list and available individual forms.
- Institutional Event Evaluation forms with ten-point buttons grouped as “Rating for question” are recognized.
- **Exit Survey (By Graduating Students):** its five-point questions use alternating 5 and 4; its Yes / No / Not Sure questions are set to **Yes**, including when another choice is selected. Questions about organization membership use **N/A** if available, otherwise **No**. The saved form has 24 five-point questions and 14 three-choice questions.
- **Course Delivery Evaluation** (`/feedback-form/course-assessment`) list and 1–5 rating groups (37 question Undergraduate/Law layout and its **Send Assessment** button verified against supplied HTML).
- **Performance Evaluation** (`/feedback-form/evaluation`) list and compatible individual forms, including the 25-question Undergraduate/Law layout with a **Send Rating** button.
- On recognized 1–5 rating scales, answers alternate **5, 4, 5, 4**. On recognized 1–10 scales, they alternate **9, 10, 9, 10**. Each scale keeps its own sequence when a form mixes them.
- Skip already selected ratings; use the existing form UI's click events so reactive forms receive changes.
- **Smart location matching:** favor a laboratory for clearly lab-related venue questions and a gym for clearly sports-related venue questions, only if that option appears. College, campus, and uncertain locations are left blank for review. Select **Prefer CCE** to fill a college question with CCE when that option appears; other location settings can prefer Gym or skip location filling.
- Vuetify Laboratory dropdowns are set to **CCE Data Communication Laboratory**, including when another laboratory is preselected.
- Clearly designated comment and improvement text fields and organization-name fields are set to **N/A**, including fields with existing text. A standard organization dropdown uses its **N/A** option when present. Organization membership choices use **N/A** when offered, otherwise **No**; numeric ratings are still filled.
- **Start all sections** scans visible Answer Survey / Evaluation / Course Assessment buttons, fills an individual form, clicks a recognized Send or Submit button, confirms in a recognized dialog, and continues to the next available entry and section. Forms that cannot be completed before sending are skipped and counted for manual review; the final status includes the last skip reason. The run has no overall time limit.
- The runner advances as soon as recognized controls appear and skips sections that already show only Completed or Locked entries. On page changes, it uses UM-PASS navigation controls when available and falls back to a full page load if needed.
- Answer links that normally open a new tab are opened in the run tab so the same Start run can continue to the submit button. Nested answer buttons inside links are counted once.
- **Auto-fill** fills newly opened forms, sets comment, improvement, and organization-name fields to **N/A**, and selects **CCE Data Communication Laboratory** without submitting; **Fill current form only** does the same on the current form for manual review.
- Quick-access buttons for Survey, Course Delivery, and Performance sections.

## Important limits

The supplied HTML includes all three listing pages, a Laboratory Satisfaction Survey form before and during its submission dialog, an Exit Survey form, an Undergraduate/Law Course Delivery form, and an Undergraduate/Law Performance form. The Laboratory form shows 18 rating groups, a Laboratory dropdown, **Send Answers**, and **Confirm & Submit**. The Exit Survey shows 24 five-point questions, 14 Yes / No / Not Sure questions, a comment field, and **Send Answers**. The Undergraduate/Law Course Delivery form shows 37 five-point questions and **Send Assessment**; the Performance form shows 25 five-point questions and **Send Rating**. Their confirmation and post-submission results have not all been captured, so those paths remain unverified against the live site. The runner leaves incompatible forms for manual review before sending. If sending or confirming was clicked but the result cannot be verified, it stops to avoid a duplicate submission. It also stops if a listing cannot be identified reliably. It skips disabled Locked and Completed entries. No hidden API calls or authentication handling are used. Smart mode leaves college, campus, and uncertain locations blank; choose **Prefer CCE** only if CCE is your real answer. The fixed laboratory, organization membership choice, and “N/A” text responses replace existing answers in those fields. The ratings should reflect your genuine evaluation before you use automatic submission.

All configuration remains in your browser's extension storage. No separate network requests. Not affiliated with UM.

## Checks

Run `node --test` to check rating grouping, location answer preservation, dropdown selection, and the simulated three-section runner. The tests use Node's built-in test runner and need no packages.
