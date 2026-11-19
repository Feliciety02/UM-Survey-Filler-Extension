const STORAGE_KEY = 'umpassSurveyFiller';
const SCRIPT_VERSION = '1.3.12';
const $ = id => document.getElementById(id);
const ui = {
  autoFill: $('auto-fill'), locationMode: $('location-mode'),
  start: $('start'), stop: $('stop'), fill: $('fill'),
  indicator: $('status-indicator'), title: $('status-title'),
  info: $('status-info'), result: $('result')
};
const config = { autoFill: false, locationMode: 'smart' };
let tabId = null;
let tabUrl = '';
let connectionError = '';
const isFeedbackUrl = url => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'umpass.umindanao.edu.ph' &&
      parsed.pathname.startsWith('/feedback-form/');
  } catch { return false; }
};

async function selectActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id ?? null;
  tabUrl = tab?.url || '';
}

function show(message, isError = false) {
  ui.result.textContent = message;
  ui.result.classList.toggle('error', isError);
}
async function save() { await chrome.storage.local.set({ [STORAGE_KEY]: config }); }
function deliver(type, options) {
  return new Promise(resolve => {
    if (tabId == null) return resolve({ response: null, error: 'No active tab' });
    chrome.tabs.sendMessage(tabId, { type, ...options }, response => {
      resolve({ response, error: chrome.runtime.lastError?.message || '' });
    });
  });
}
async function injectContentScript() {
  try {
    let supported = isFeedbackUrl(tabUrl);
    if (!supported && !tabUrl) {
      const [probe] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => location.hostname === 'umpass.umindanao.edu.ph' &&
          location.pathname.startsWith('/feedback-form/')
      });
      supported = probe?.result === true;
    }
    if (!supported) return false;
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    return true;
  } catch (error) {
    connectionError = error?.message || 'Script injection failed';
    return false;
  }
}
async function send(type, options = {}) {
  if (tabId == null) await selectActiveTab();
  let result = await deliver(type, options);
  connectionError = result.error;
  if (!result.error) return result.response;
  if (!/Receiving end does not exist|Could not establish connection/i.test(result.error)) return null;
  if (!await injectContentScript()) return null;
  result = await deliver(type, options);
  connectionError = result.error;
  return result.error ? null : result.response;
}
ui.start.disabled = true;
async function refresh() {
  const state = await send('UM_PASS_INSPECT', { config });
  ui.indicator.classList.remove('ready');
  const running = !!state?.automation?.active;
  ui.start.hidden = running;
  ui.stop.hidden = !running;
  ui.fill.disabled = running;
  ui.start.disabled = !state?.ok || !state.supported || state.scriptVersion !== SCRIPT_VERSION;
  if (!state?.ok || !state.supported) {
    ui.title.textContent = isFeedbackUrl(tabUrl) ? 'Could not connect to UM-PASS' : 'Open a UM-PASS form';
    ui.info.textContent = isFeedbackUrl(tabUrl)
      ? 'Refresh this tab or allow extension access to UM-PASS.'
      : 'Select an available feedback form.';
    return;
  }
  if (state.scriptVersion !== SCRIPT_VERSION) {
    ui.title.textContent = 'Refresh UM-PASS tab';
    ui.info.textContent = 'This tab has an older extension script. Refresh the tab, then reopen the extension.';
    ui.fill.disabled = true;
    return;
  }
  if (running) {
    ui.title.textContent = `Running ${state.automation.section || 'UM-PASS'}`;
    ui.info.textContent = state.automation.message;
    ui.indicator.classList.add('ready');
    return;
  }
  if (state.automation?.message) show(state.automation.message, state.automation.phase === 'error');
  if (state.isList) {
    ui.title.textContent = 'Ready to start';
    ui.info.textContent = 'Start will scan Survey, Course, and Performance.';
    ui.indicator.classList.add('ready');
    return;
  }
  if (!state.total && !state.locations) {
    ui.title.textContent = 'No recognized questions';
    ui.info.textContent = 'This form may need manual answers.';
    return;
  }
  ui.title.textContent = `${state.section} — ${state.total} ratings`;
  const parts = [`${state.answered} completed`, `${state.unanswered} unanswered`];
  if (state.unansweredChoices) parts.push(`${state.unansweredChoices} choices pending`);
  if (state.suggestedLocations) parts.push(`${state.suggestedLocations} location match${state.suggestedLocations === 1 ? '' : 'es'}`);
  ui.info.textContent = parts.join(' · ');
  ui.indicator.classList.add('ready');
}
async function init() {
  const stored = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] || {};
  Object.assign(config, stored);
  delete config.labChoice;
  delete config.comment;
  // Older saved rating settings are ignored; current versions use fixed alternating patterns.
  config.locationMode = ['smart','off','cce','gym'].includes(config.locationMode) ? config.locationMode : 'smart';
  ui.autoFill.checked = !!config.autoFill;
  ui.locationMode.value = config.locationMode;
  await selectActiveTab();
  await refresh();
}
ui.autoFill.addEventListener('change', async () => {
  config.autoFill = ui.autoFill.checked;
  await save();
  show(config.autoFill ? 'Auto-fill is on. Please review each completed form.' : 'Auto-fill is off.');
});
ui.locationMode.addEventListener('change', async () => {
  config.locationMode = ui.locationMode.value;
  await save(); await refresh();
  show(config.locationMode === 'smart' ? 'Smart location matching is on.' : 'Location preference saved.');
});
ui.start.addEventListener('click', async () => {
  ui.start.disabled = true;
  try {
    await save();
    const response = await send('UM_PASS_START');
    if (!response?.ok) show(response?.error ||
      (connectionError ? 'Could not connect to this tab. Refresh it or allow extension access to UM-PASS.'
        : 'Open a UM-PASS feedback page before starting.'), true);
    else show('Started. Keep this tab open; reopen the extension to check progress or stop.');
    await refresh();
  } catch {
    show('Could not save settings or start automation.', true);
  } finally {
    ui.start.disabled = false;
  }
});
ui.stop.addEventListener('click', async () => {
  const response = await send('UM_PASS_STOP');
  if (!response?.ok) show('Could not stop this tab. Close it to halt the run.', true);
  else await refresh();
});
ui.fill.addEventListener('click', async () => {
  if (tabId === null) { show('Open an individual form on UM-PASS first.', true); return; }
  ui.fill.disabled = true;
  ui.fill.textContent = 'Filling…';
  await save();
  const response = await send('UM_PASS_FILL', { config, overwrite: false });
  if (!response) show('Could not connect to the form. Refresh the page and try again.', true);
  else if (!response.ok) show(response.error || 'Unable to fill this page.', true);
  else if (!response.filled && !response.choiceFilled && !response.locationFilled && !response.commentFilled && !response.organizationFilled && !response.locationReview && !response.organizationReview && !response.choiceReview && !response.labPending) show(response.note || 'No unanswered matching fields found.');
  else {
    const parts = [`${response.filled || 0} ratings`];
    if (response.locationFilled) parts.push(`${response.locationFilled} location${response.locationFilled === 1 ? '' : 's'}`);
    if (response.locationReview) parts.push(`${response.locationReview} locations to review`);
    if (response.existing) parts.push(`${response.existing} unchanged`);
    if (response.commentFilled) parts.push(`${response.commentFilled} comment${response.commentFilled === 1 ? '' : 's'} set to N/A`);
    if (response.organizationFilled) parts.push(`${response.organizationFilled} organization answer${response.organizationFilled === 1 ? '' : 's'} set to N/A`);
    if (response.organizationReview) parts.push(`${response.organizationReview} organization answers to review`);
    if (response.choiceFilled) parts.push(`${response.choiceFilled} choice answer${response.choiceFilled === 1 ? '' : 's'}`);
    if (response.choiceReview) parts.push(`${response.choiceReview} choices to verify`);
    if (response.labPending) parts.push('selecting CCE Data Communication Laboratory');
    show(`Filled ${parts.join(' · ')}. Review before submitting.`);
  }
  ui.fill.textContent = 'Fill current form only';
  ui.fill.disabled = false;
  await refresh();
});
for (const button of document.querySelectorAll('[data-nav]')) {
  button.addEventListener('click', async () => {
    const url = `https://umpass.umindanao.edu.ph/feedback-form/${button.dataset.nav}`;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) await chrome.tabs.update(tab.id, { url });
  });
}
init().catch(() => {
  ui.title.textContent = 'Unable to inspect this tab';
  ui.info.textContent = 'Reload UM-PASS and reopen the extension.';
});
