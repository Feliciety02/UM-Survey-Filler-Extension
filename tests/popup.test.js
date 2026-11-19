const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'popup.js'), 'utf8');

function popupElement() {
  const listeners = {};
  return {
    listeners, textContent: '', value: '', checked: false, disabled: false, hidden: false,
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(type, listener) { listeners[type] = listener; }
  };
}

async function openPopup({ tabUrl = 'https://umpass.umindanao.edu.ph/feedback-form/course-assessment',
  receiverInitiallyPresent = false, scriptVersion = '1.3.10' } = {}) {
  const ids = ['auto-fill', 'location-mode', 'start', 'stop', 'fill', 'status-indicator',
    'status-title', 'status-info', 'result'];
  const elements = Object.fromEntries(ids.map(id => [id, popupElement()]));
  const calls = [];
  let receiverPresent = receiverInitiallyPresent;
  const chrome = {
    runtime: { lastError: null },
    storage: { local: { get: async () => ({}), set: async () => {} } },
    tabs: {
      query: async () => [{ id: 42, url: tabUrl }],
      sendMessage(_tabId, message, callback) {
        calls.push({ kind: 'message', type: message.type });
        if (!receiverPresent) {
          chrome.runtime.lastError = { message: 'Could not establish connection. Receiving end does not exist.' };
          callback(undefined);
          chrome.runtime.lastError = null;
          return;
        }
        chrome.runtime.lastError = null;
        callback(message.type === 'UM_PASS_INSPECT'
          ? { ok: true, supported: true, scriptVersion, isList: true,
              section: 'Course Delivery', automation: null }
          : { ok: true });
      }
    },
    scripting: {
      async executeScript(injection) {
        calls.push({ kind: 'inject', files: injection.files || null });
        if (injection.func) return [{ result: true }];
        receiverPresent = true;
        return [{ result: undefined }];
      }
    }
  };
  const document = {
    getElementById(id) { return elements[id]; },
    querySelectorAll() { return []; }
  };
  vm.runInNewContext(source, { chrome, document, URL });
  await new Promise(resolve => setImmediate(resolve));
  return { elements, calls };
}

test('popup injects the content script after extension reload and Start succeeds', async () => {
  const popup = await openPopup();
  assert.equal(popup.elements.start.disabled, false);
  assert.deepEqual(popup.calls.filter(call => call.kind === 'inject').map(call => call.files && Array.from(call.files)),
    [['content.js']]);

  await popup.elements.start.listeners.click();
  assert.ok(popup.calls.some(call => call.type === 'UM_PASS_START'));
  assert.match(popup.elements.result.textContent, /Started/);
});

test('popup probes the page when tab metadata omits its URL', async () => {
  const popup = await openPopup({ tabUrl: null });
  assert.deepEqual(popup.calls.filter(call => call.kind === 'inject').map(call => call.files && Array.from(call.files)),
    [null, ['content.js']]);
  assert.equal(popup.elements.start.disabled, false);
});

test('popup does not inject when a content script already responds', async () => {
  const popup = await openPopup({ receiverInitiallyPresent: true });
  assert.equal(popup.calls.filter(call => call.kind === 'inject').length, 0);
  assert.equal(popup.elements.start.disabled, false);
});

test('popup blocks Start when the tab still has an older content script', async () => {
  const popup = await openPopup({ receiverInitiallyPresent: true, scriptVersion: '1.3.9' });
  assert.equal(popup.elements.start.disabled, true);
  assert.match(popup.elements['status-info'].textContent, /Refresh the tab/);
});
