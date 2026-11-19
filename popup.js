const STORAGE_KEY = 'umpassSurveyFiller';
const $ = id => document.getElementById(id);
const ui = {
  autoFill: $('auto-fill'), locationMode: $('location-mode'), comment: $('comment'),
  fill: $('fill'), indicator: $('status-indicator'), title: $('status-title'),
  info: $('status-info'), result: $('result')
};
const config = { autoFill: false, locationMode: 'smart', comment: '' };
let tabId = null;

function show(message, isError = false) {
  ui.result.textContent = message;
  ui.result.classList.toggle('error', isError);
}
async function save() { await chrome.storage.local.set({ [STORAGE_KEY]: config }); }
function send(type, options = {}) {
  return new Promise(resolve => {
    if (tabId == null) return resolve(null);
    chrome.tabs.sendMessage(tabId, { type, ...options }, response => {
      resolve(chrome.runtime.lastError ? null : response);
    });
  });
}
async function refresh() {
  const state = await send('UM_PASS_INSPECT', { config });
  ui.indicator.classList.remove('ready');
  if (!state?.ok || !state.supported) {
    ui.title.textContent = 'Open a UM-PASS form';
    ui.info.textContent = 'Select an available feedback form.';
    return;
  }
  if (state.isList) {
    ui.title.textContent = `${state.section} — listing page`;
    ui.info.textContent = 'Open an available Answer Survey / Evaluation first.';
    return;
  }
  if (!state.total && !state.locations) {
    ui.title.textContent = 'No recognized questions';
    ui.info.textContent = 'This form may need manual answers.';
    return;
  }
  ui.title.textContent = `${state.section} — ${state.total} ratings`;
  const parts = [`${state.answered} completed`, `${state.unanswered} unanswered`];
  if (state.suggestedLocations) parts.push(`${state.suggestedLocations} location match${state.suggestedLocations === 1 ? '' : 'es'}`);
  ui.info.textContent = parts.join(' · ');
  ui.indicator.classList.add('ready');
}
async function init() {
  const stored = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] || {};
  Object.assign(config, stored);
  // Older v1.0 saved rating is deliberately ignored; v1.2 always mixes 4 / 5.
  config.locationMode = ['smart','off','cce','gym'].includes(config.locationMode) ? config.locationMode : 'smart';
  ui.autoFill.checked = !!config.autoFill;
  ui.locationMode.value = config.locationMode;
  ui.comment.value = config.comment || '';
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url?.startsWith('https://umpass.umindanao.edu.ph/feedback-form/')) tabId = tab.id;
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
let commentTimer;
ui.comment.addEventListener('input', () => {
  config.comment = ui.comment.value;
  clearTimeout(commentTimer);
  commentTimer = setTimeout(save, 250);
});
ui.fill.addEventListener('click', async () => {
  if (tabId === null) { show('Open an individual form on UM-PASS first.', true); return; }
  ui.fill.disabled = true;
  ui.fill.textContent = 'Filling…';
  config.comment = ui.comment.value;
  await save();
  const response = await send('UM_PASS_FILL', { config, overwrite: false, fresh: false });
  if (!response) show('Could not connect to the form. Refresh the page and try again.', true);
  else if (!response.ok) show(response.error || 'Unable to fill this page.', true);
  else if (!response.filled && !response.locationFilled && !response.commentFilled) show(response.note || 'No unanswered matching fields found.');
  else {
    const parts = [`${response.filled || 0} ratings`];
    if (response.locationFilled) parts.push(`${response.locationFilled} location${response.locationFilled === 1 ? '' : 's'}`);
    if (response.locationReview) parts.push(`${response.locationReview} locations to review`);
    if (response.existing) parts.push(`${response.existing} unchanged`);
    if (response.commentFilled) parts.push('comment added');
    show(`Filled ${parts.join(' · ')}. Review before submitting.`);
  }
  ui.fill.textContent = 'Fill unanswered questions →';
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
