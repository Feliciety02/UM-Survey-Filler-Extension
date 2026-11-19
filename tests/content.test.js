const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

class Element {
  constructor({ value = '', text = '', label = '', order = 0 } = {}) {
    this.attributes = { value };
    this._value = value;
    this.textContent = text;
    this.label = label;
    this.order = order;
    this.id = '';
    this.disabled = false;
    this.checked = false;
    this.classList = { contains: () => false };
    this.events = [];
  }

  get value() { return this._value; }
  set value(value) { this._value = value; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  closest(selector) { return selector === 'label' && this.label ? { textContent: this.label } : null; }
  matches() { return false; }
  getClientRects() { return [1]; }
  compareDocumentPosition(other) { return this.order < other.order ? 4 : 2; }
  click() { this.checked = true; }
  dispatchEvent(event) { this.events.push(event.type); }
}

class Select extends Element {
  constructor({ options, value, label }) {
    super({ label });
    this.options = options.map(option => new Element({ value: option.value, text: option.label }));
    this._value = value;
    this.selectedIndex = this.options.findIndex(option => option.value === value);
    this.writes = 0;
  }

  get value() { return this._value; }
  set value(value) {
    this._value = value;
    this.selectedIndex = this.options.findIndex(option => option.value === value);
    this.writes++;
  }
}

function container(controls) {
  const element = new Element();
  element.querySelectorAll = () => controls;
  return element;
}

function makePage({ containers = [], selects = [], ratingSelector = '.rating-options' } = {}) {
  let onMessage;
  const document = {
    documentElement: new Element(),
    title: 'Test survey',
    querySelectorAll(selector) {
      if (selector.includes(ratingSelector)) return containers;
      if (selector === 'select:not([disabled])') return selects;
      return [];
    },
    querySelector() { return null; }
  };
  const context = {
    document,
    location: { hostname: 'umpass.umindanao.edu.ph', pathname: '/feedback-form/survey/test', search: '' },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    chrome: {
      runtime: { onMessage: { addListener(listener) { onMessage = listener; } } },
      storage: { local: { get() {} }, onChanged: { addListener() {} } }
    },
    crypto: { getRandomValues(values) { values[0] = 0; return values; } },
    MutationObserver: class { observe() {} },
    window: { addEventListener() {} },
    Node: { DOCUMENT_POSITION_FOLLOWING: 4 },
    CSS: { escape: value => value },
    HTMLSelectElement: Select,
    HTMLTextAreaElement: Element,
    HTMLInputElement: Element,
    Event: class { constructor(type) { this.type = type; } },
    setTimeout() { return 1; },
    clearTimeout() {}
  };
  vm.runInNewContext(source, context);
  return message => {
    let result;
    onMessage(message, null, response => { result = response; });
    return result;
  };
}

test('separate rating questions inside a fieldset are both filled', () => {
  const first = Array.from({ length: 5 }, (_, index) => new Element({ value: String(index + 1), order: index }));
  const second = Array.from({ length: 5 }, (_, index) => new Element({ value: String(index + 1), order: index + 5 }));
  const send = makePage({ containers: [container([...first, ...second]), container(first), container(second)] });

  assert.equal(send({ type: 'UM_PASS_INSPECT' }).total, 2);
  assert.equal(send({ type: 'UM_PASS_FILL' }).filled, 2);
  assert.equal(first.filter(control => control.checked).length, 1);
  assert.equal(second.filter(control => control.checked).length, 1);
  assert.equal(first.find(control => control.checked).value, '5');
  assert.equal(second.find(control => control.checked).value, '4');
});

test('ten-point questions alternate 9 and 10', () => {
  const first = Array.from({ length: 10 }, (_, index) =>
    new Element({ value: String(index + 1), order: index }));
  const second = Array.from({ length: 10 }, (_, index) =>
    new Element({ value: String(index + 1), order: index + 10 }));
  const send = makePage({ containers: [container(first), container(second)] });

  assert.equal(send({ type: 'UM_PASS_INSPECT' }).total, 2);
  assert.equal(send({ type: 'UM_PASS_FILL' }).filled, 2);
  assert.equal(first.find(control => control.checked).value, '9');
  assert.equal(second.find(control => control.checked).value, '10');
});

test('Institutional Event rating groups with labelled buttons are filled', () => {
  const groups = Array.from({ length: 9 }, (_, question) =>
    Array.from({ length: 10 }, (_, index) => {
      const score = 10 - index;
      const button = new Element({ order: question * 10 + index });
      button.attributes['aria-label'] = `${score} - ${score === 10 ? 'Extremely Satisfied' : 'Satisfied'}`;
      return button;
    }));
  const send = makePage({
    containers: groups.map(container), ratingSelector: '[role="group"]'
  });

  assert.equal(send({ type: 'UM_PASS_INSPECT' }).total, 9);
  assert.equal(send({ type: 'UM_PASS_FILL' }).filled, 9);
  assert.deepEqual(groups.map(group => group.find(button => button.checked).getAttribute('aria-label').split(' ')[0]),
    ['9', '10', '9', '10', '9', '10', '9', '10', '9']);
});

test('Exit Survey Yes / No / Not Sure questions are set to Yes', () => {
  const rating = Array.from({ length: 5 }, (_, index) =>
    new Element({ value: String(index + 1), order: index }));
  const choices = ['Yes - Yes', 'No - No', 'Not Sure - Not Sure'].map((label, index) => {
    const button = new Element({ value: String(index + 1), order: index + 5 });
    button.attributes['aria-label'] = label;
    return button;
  });
  const send = makePage({ containers: [container(rating), container(choices)] });

  assert.equal(send({ type: 'UM_PASS_INSPECT' }).total, 1);
  assert.equal(send({ type: 'UM_PASS_INSPECT' }).unansweredChoices, 1);
  const result = send({ type: 'UM_PASS_FILL' });
  assert.equal(result.filled, 1);
  assert.equal(result.choiceFilled, 1);
  assert.equal(result.choiceReview, 0);
  assert.equal(choices.find(button => button.checked).getAttribute('aria-label'), 'Yes - Yes');
});

test('mixed five-point and ten-point questions alternate independently', () => {
  const controls = (count, start) => Array.from({ length: count }, (_, index) =>
    new Element({ value: String(index + 1), order: start + index }));
  const groups = [controls(5, 0), controls(10, 5), controls(5, 15), controls(10, 20)];
  const send = makePage({ containers: groups.map(container) });

  assert.equal(send({ type: 'UM_PASS_FILL' }).filled, 4);
  assert.deepEqual(groups.map(group => group.find(control => control.checked).value),
    ['5', '9', '4', '10']);
});

test('a ten-point dropdown uses 9 and is not mistaken for a location field', () => {
  const select = new Select({
    label: 'Venue satisfaction', value: '',
    options: [
      { value: '', label: 'Choose a rating' },
      ...Array.from({ length: 10 }, (_, index) => ({
        value: String(index + 1), label: String(index + 1)
      }))
    ]
  });
  const send = makePage({ selects: [select] });

  assert.equal(send({ type: 'UM_PASS_INSPECT' }).total, 1);
  const result = send({ type: 'UM_PASS_FILL' });
  assert.equal(result.filled, 1);
  assert.equal(result.locationReview, 0);
  assert.equal(select.value, '9');
});

test('a real first select option is preserved as an existing answer', () => {
  const select = new Select({
    label: 'College', value: 'other',
    options: [{ value: 'other', label: 'Other college' }, { value: 'cce', label: 'CCE' }]
  });
  const send = makePage({ selects: [select] });

  assert.equal(send({ type: 'UM_PASS_FILL', config: { locationMode: 'cce' } }).locationFilled, 0);
  assert.equal(select.value, 'other');
  assert.equal(select.writes, 0);
});

test('college is left blank in Smart mode and filled only with Prefer CCE', () => {
  const select = new Select({
    label: 'College', value: '',
    options: [{ value: '', label: 'Choose a college' }, { value: 'cce', label: 'CCE' }]
  });
  const send = makePage({ selects: [select] });

  const smart = send({ type: 'UM_PASS_FILL', config: { locationMode: 'smart' } });
  assert.equal(smart.locationFilled, 0);
  assert.equal(select.value, '');

  const explicit = send({ type: 'UM_PASS_FILL', config: { locationMode: 'cce' } });
  assert.equal(explicit.locationFilled, 1);
  assert.equal(select.value, 'cce');
  assert.deepEqual(select.events, ['input', 'change']);
});

function makeAutomationPage({
  hasConfirm = true, hasSuccess = true, entryCount = 2, autoFill = false,
  sendLabel = 'Send Answer', confirmLabel = 'Confirm & Submit',
  initialComment = 'Existing improvement', initialLaboratory = 'CCE Data Communication Laboratory',
  laboratoryAvailable = true, dialogIncomplete = false, listingStatus = 'Completed',
  clientNavigation = false, stalledBackLink = false, ratingCount = 5, groupOnly = false,
  choiceGroupCount = 0, choiceSelectionWorks = true, unrecognizedEntry = -1,
  organizationChoiceGroups = 0, organizationChoiceNA = false,
  newTabAnswerLinks = false, startsOnAnswerForm = false, initialOrganization = null,
  organizationDropdown = false
} = {}) {
  const fixedLaboratory = 'CCE Data Communication Laboratory';
  let now = 10000;
  let nextTimer = 0;
  let view = 'list';
  const submittedEntries = new Set();
  let currentEntry = -1;
  let sendClicks = 0;
  let confirmClicks = 0;
  let hardNavigations = 0;
  let newTabClicks = 0;
  let onMessage;
  const timers = new Map();
  const storage = new Map();
  const location = {
    hostname: 'umpass.umindanao.edu.ph', pathname: '/feedback-form/survey', search: '',
    get href() { return `https://${this.hostname}${this.pathname}${this.search}`; },
    assign(pathname) {
      hardNavigations++;
      const target = new URL(pathname, this.href);
      if (target.pathname.endsWith('/answer')) {
        answers[Number(target.searchParams.get('entry')) - 1].click();
        this.search = target.search;
      } else {
        this.pathname = target.pathname;
        this.search = target.search;
        view = 'list';
      }
    }
  };
  const ratingControls = Array.from({ length: ratingCount }, (_, index) =>
    new Element({ value: String(index + 1), order: index }));
  const ratings = container(ratingControls);
  const choiceGroups = Array.from({ length: choiceGroupCount }, () => container(
    ['Yes - Yes', 'No - No', 'Not Sure - Not Sure'].map((label, index) => {
      const button = new Element({ value: String(index + 1) });
      button.attributes['aria-label'] = label;
      if (!choiceSelectionWorks) button.click = () => {};
      return button;
    })
  ));
  for (let groupIndex = 0; groupIndex < organizationChoiceGroups; groupIndex++) {
    const labels = ['Yes - Yes', 'No - No', organizationChoiceNA
      ? 'N/A - Not applicable' : 'Not Sure - Not Sure'];
    const group = container(labels.map((label, index) => {
      const button = new Element({ value: String(index + 1) });
      button.attributes['aria-label'] = label;
      return button;
    }));
    group.closest = selector => /fieldset|question-item|question-card|v-card/.test(selector)
      ? { textContent: 'Do you belong to a student organization?', querySelector: () => null }
      : null;
    choiceGroups.push(group);
  }
  const improvementLabel = '44. What specific aspects of this laboratory should be improved? *';
  const improvement = new Element({ label: improvementLabel, value: initialComment });
  improvement.id = 'improvement';
  improvement.attributes['aria-labelledby'] = 'improvement-label';
  const generalComment = new Element({ label: 'Comments about campus facilities', value: 'Existing comment' });
  const organizationInput = initialOrganization === null ? null
    : organizationDropdown
      ? new Select({ label: 'Student organization', value: initialOrganization, options: [
        { value: '', label: 'Select an organization' },
        { value: 'na', label: 'N/A (No organization)' }
      ] })
      : new Element({ label: 'Name of student organization', value: initialOrganization });
  if (organizationInput) organizationInput.required = true;
  let menuOpen = false;
  const labInput = new Element({ value: initialLaboratory });
  labInput.required = true;
  labInput.attributes['aria-controls'] = 'lab-menu';
  labInput.click = () => { menuOpen = true; };
  const labSelection = new Element({ text: initialLaboratory });
  const labOption = new Element({ text: laboratoryAvailable ? fixedLaboratory : 'Other Laboratory' });
  labOption.querySelector = () => ({ textContent: labOption.textContent });
  labOption.click = () => {
    labInput.value = labOption.textContent;
    labSelection.textContent = labOption.textContent;
    menuOpen = false;
  };
  const labMenu = container([labOption]);
  const labContainer = new Element();
  labContainer.querySelector = selector => {
    if (selector === '.v-field-label, label') return { textContent: 'Laboratory *' };
    if (selector === 'input[role="combobox"]') return labInput;
    if (selector === '.v-select__selection-text') return labSelection;
    return null;
  };
  const answers = Array.from({ length: entryCount }, (_, index) => {
    const answer = new Element({ text: 'Answer Course Assessment' });
    answer.closest = selector => selector === 'a'
      ? { getAttribute: () => `/feedback-form/course-assessment/answer?entry=${index + 1}` } : null;
    answer.click = () => {
      currentEntry = index;
      ratingControls.forEach(control => { control.checked = false; });
      choiceGroups.forEach(group => group.querySelectorAll().forEach(control => { control.checked = false; }));
      improvement.value = initialComment;
      generalComment.value = 'Existing comment';
      if (organizationInput) organizationInput.value = initialOrganization;
      labInput.value = initialLaboratory;
      labSelection.textContent = initialLaboratory;
      menuOpen = false;
      location.pathname = '/feedback-form/course-assessment/answer';
      view = 'form';
    };
    return answer;
  });
  const answerLinks = newTabAnswerLinks ? answers.map((answer, index) => {
    const link = new Element({ text: answer.textContent });
    link.attributes.href = `/feedback-form/course-assessment/answer?entry=${index + 1}`;
    link.attributes.target = '_blank';
    link.closest = selector => ['a', 'a[href]'].includes(selector) ? link : null;
    link.click = () => { newTabClicks++; };
    answer.closest = selector => ['a', 'a[href]'].includes(selector) ? link : null;
    return link;
  }) : [];
  if (startsOnAnswerForm && answers.length) {
    answers[0].click();
    location.search = '?entry=1';
  }
  const sendButton = new Element({ text: sendLabel });
  sendButton.click = () => { sendClicks++; view = hasConfirm ? 'confirm' : 'waiting'; };
  const confirmButton = new Element({ text: confirmLabel });
  confirmButton.click = () => {
    confirmClicks++;
    if (hasSuccess) { submittedEntries.add(currentEntry); view = 'success'; }
    else view = 'waiting';
  };
  const dialog = container([confirmButton]);
  dialog.textContent = dialogIncomplete
    ? 'You have answered 17 of 18 applicable questions.'
    : 'You have answered 18 of 18 applicable questions.';
  const notice = new Element({ text: 'Successfully submitted' });
  const statusChip = new Element({ text: listingStatus });
  const backLink = new Element({ text: 'Back' });
  backLink.attributes.href = 'https://umpass.umindanao.edu.ph/feedback-form/course-assessment';
  backLink.click = () => {
    if (!stalledBackLink) { location.pathname = '/feedback-form/course-assessment'; view = 'list'; }
  };
  const navItems = ['Survey', 'Course Assessment', 'Performance Evaluation'].map((label, index) => {
    const item = new Element();
    item.querySelector = selector => selector === '.nav-text' ? { textContent: label } : null;
    item.click = () => {
      location.pathname = `/feedback-form/${['survey', 'course-assessment', 'evaluation'][index]}`;
      view = 'list';
    };
    return item;
  });
  const document = {
    documentElement: new Element(), readyState: 'complete',
    get title() {
      if (view !== 'list') return 'Answer form';
      return `${location.pathname} listing`;
    },
    querySelectorAll(selector) {
      if (selector.startsWith('.rating-options')) return view === 'form' && currentEntry !== unrecognizedEntry &&
        (!groupOnly || selector.includes('[role="group"]')) ? [ratings, ...choiceGroups] : [];
      if (selector === 'a[href]') return clientNavigation && view === 'success' ? [backLink] : [];
      if (selector === '.nav-item') return clientNavigation && view === 'list' ? navItems : [];
      if (selector === 'a, button, [role="button"], input[type="button"]') {
        return view === 'list' && location.pathname === '/feedback-form/course-assessment'
          ? answers.flatMap((answer, index) => submittedEntries.has(index) ? [] :
            newTabAnswerLinks ? [answerLinks[index], answer] : [answer]) : [];
      }
      if (selector === 'button, input[type="submit"], [role="button"]') return view === 'form' ? [sendButton] : [];
      if (selector.startsWith('dialog[open]')) return view === 'confirm' ? [dialog] : [];
      if (selector.startsWith('[role="alert"]')) return view === 'success' ? [notice] : [];
      if (selector === '.v-chip__content, .status-chip, [data-status]') return view === 'list' ? [statusChip] : [];
      if (selector === '.v-select') return view === 'form' ? [labContainer] : [];
      if (selector === 'textarea:not([readonly]):not([disabled])') return view === 'form' ? [improvement, generalComment] : [];
      if (selector === 'form input:not([type]), form input[type="text"], form textarea, form select')
        return view === 'form' && organizationInput ? [organizationInput] : [];
      if (selector.startsWith('form input:not([type="hidden"])')) return view === 'form' ? [labInput, improvement, generalComment] : [];
      return [];
    },
    querySelector() { return null; },
    getElementById(id) {
      if (id === 'improvement-label') return { textContent: improvementLabel };
      if (id === 'lab-menu' && menuOpen) return labMenu;
      return null;
    }
  };
  const context = {
    document, location, URL,
    Date: class extends Date { static now() { return now; } },
    sessionStorage: {
      getItem(key) { return storage.get(key) ?? null; },
      setItem(key, value) { storage.set(key, value); }
    },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    chrome: {
      runtime: { onMessage: { addListener(listener) { onMessage = listener; } } },
      storage: {
        local: { get(key, callback) { callback({ [key]: { locationMode: 'smart', autoFill, comment: 'Old setting', labChoice: 'Old laboratory' } }); } },
        onChanged: { addListener() {} }
      }
    },
    crypto: { getRandomValues(values) { values[0] = 0; return values; } },
    MutationObserver: class { observe() {} },
    window: { addEventListener() {} },
    Node: { DOCUMENT_POSITION_FOLLOWING: 4 },
    CSS: { escape: value => value },
    HTMLSelectElement: Select,
    HTMLTextAreaElement: Element,
    HTMLInputElement: Element,
    Event: class { constructor(type) { this.type = type; } },
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, due: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  };
  vm.runInNewContext(source, context);
  const send = message => {
    let result;
    onMessage(message, null, response => { result = response; });
    return result;
  };
  const advance = milliseconds => {
    const target = now + milliseconds;
    for (let steps = 0; steps < 1000; steps++) {
      const next = [...timers].sort((a, b) => a[1].due - b[1].due)[0];
      if (!next || next[1].due > target) { now = target; return; }
      now = next[1].due;
      timers.delete(next[0]);
      next[1].callback();
    }
    throw new Error('Automation scheduled too many steps');
  };
  return {
    send, advance, openFirstForm() { answers[0].click(); },
    get submitted() { return submittedEntries.size === entryCount; },
    get sendClicks() { return sendClicks; },
    get confirmClicks() { return confirmClicks; },
    get hardNavigations() { return hardNavigations; },
    get newTabClicks() { return newTabClicks; },
    get selectedRatings() { return ratingControls.filter(control => control.checked).map(control => control.value); },
    get selectedChoices() { return choiceGroups.map(group =>
      group.querySelectorAll().find(control => control.checked)?.getAttribute('aria-label') || null); },
    get commentValues() { return [improvement.value, generalComment.value]; },
    get organizationValue() { return organizationInput?.value; },
    get laboratoryValue() { return labInput.value; }
  };
}

test('Start scans multiple Course Assessment entries and advances through all three sections', () => {
  const page = makeAutomationPage();
  assert.equal(page.send({ type: 'UM_PASS_START' }).ok, true);
  page.advance(5000);

  const state = page.send({ type: 'UM_PASS_INSPECT' }).automation;
  assert.equal(state.phase, 'done');
  assert.equal(state.processed, 2);
  assert.equal(page.submitted, true);
  assert.equal(page.sendClicks, 2);
  assert.equal(page.confirmClicks, 2);
});

test('Start submits a recognized ten-point role-group form with a 9 rating', () => {
  const page = makeAutomationPage({ entryCount: 1, ratingCount: 10, groupOnly: true });
  assert.equal(page.send({ type: 'UM_PASS_START' }).ok, true);
  page.advance(5000);

  const state = page.send({ type: 'UM_PASS_INSPECT' }).automation;
  assert.equal(state.phase, 'done');
  assert.equal(state.processed, 1);
  assert.deepEqual(page.selectedRatings, ['9']);
  assert.equal(page.confirmClicks, 1);
});

test('Start submits an Exit Survey after selecting Yes for all choices', () => {
  const page = makeAutomationPage({ entryCount: 1, choiceGroupCount: 14 });
  assert.equal(page.send({ type: 'UM_PASS_START' }).ok, true);
  page.advance(5000);

  const state = page.send({ type: 'UM_PASS_INSPECT' }).automation;
  assert.equal(state.phase, 'done');
  assert.equal(state.processed, 1);
  assert.equal(page.sendClicks, 1);
  assert.ok(page.selectedChoices.every(choice => choice === 'Yes - Yes'));
});

test('organization membership uses No while other choices and ratings are filled', () => {
  const page = makeAutomationPage({
    entryCount: 1, choiceGroupCount: 1, organizationChoiceGroups: 1
  });
  assert.equal(page.send({ type: 'UM_PASS_START' }).ok, true);
  page.advance(5000);

  const state = page.send({ type: 'UM_PASS_INSPECT' }).automation;
  assert.equal(state.phase, 'done');
  assert.deepEqual(page.selectedChoices, ['Yes - Yes', 'No - No']);
  assert.deepEqual(page.selectedRatings, ['5']);
});

test('organization membership uses N/A when that choice is offered', () => {
  const page = makeAutomationPage({
    entryCount: 1, organizationChoiceGroups: 1, organizationChoiceNA: true
  });
  assert.equal(page.send({ type: 'UM_PASS_START' }).ok, true);
  page.advance(5000);

  const state = page.send({ type: 'UM_PASS_INSPECT' }).automation;
  assert.equal(state.phase, 'done');
  assert.deepEqual(page.selectedChoices, ['N/A - Not applicable']);
  assert.deepEqual(page.selectedRatings, ['5']);
});

test('Start recognizes the Undergraduate/Law Send Assessment button', () => {
  const page = makeAutomationPage({ entryCount: 1, sendLabel: 'Send Assessment' });
  assert.equal(page.send({ type: 'UM_PASS_START' }).ok, true);
  page.advance(5000);

  const state = page.send({ type: 'UM_PASS_INSPECT' }).automation;
  assert.equal(state.phase, 'done');
  assert.equal(state.processed, 1);
  assert.equal(page.sendClicks, 1);
  assert.equal(page.confirmClicks, 1);
});

test('Start recognizes Send Rating and Confirm Rating on the Law evaluation', () => {
  const page = makeAutomationPage({
    entryCount: 1, sendLabel: 'Send Rating', confirmLabel: 'Confirm Rating'
  });
  assert.equal(page.send({ type: 'UM_PASS_START' }).ok, true);
  page.advance(5000);

  const state = page.send({ type: 'UM_PASS_INSPECT' }).automation;
  assert.equal(state.phase, 'done');
  assert.equal(state.processed, 1);
  assert.equal(page.sendClicks, 1);
  assert.equal(page.confirmClicks, 1);
});

test('a new-tab answer link stays in the run tab and reaches Send Assessment', () => {
  const page = makeAutomationPage({
    entryCount: 1, sendLabel: 'Send Assessment', newTabAnswerLinks: true
  });
  assert.equal(page.send({ type: 'UM_PASS_START' }).ok, true);
  page.advance(5000);

  const state = page.send({ type: 'UM_PASS_INSPECT' }).automation;
  assert.equal(state.phase, 'done');
  assert.equal(state.processed, 1);
  assert.equal(page.sendClicks, 1);
  assert.equal(page.confirmClicks, 1);
  assert.equal(page.newTabClicks, 0);
});

test('Start sends the already open Assessment form before scanning all sections', () => {
  const page = makeAutomationPage({
    entryCount: 2, sendLabel: 'Send Assessment', newTabAnswerLinks: true,
    startsOnAnswerForm: true
  });
  assert.equal(page.send({ type: 'UM_PASS_START' }).ok, true);
  page.advance(5000);

  const state = page.send({ type: 'UM_PASS_INSPECT' }).automation;
  assert.equal(state.phase, 'done');
  assert.equal(state.processed, 2);
  assert.equal(page.sendClicks, 2);
  assert.equal(page.confirmClicks, 2);
});

test('Start skips an Exit Survey whose Yes selections do not register', () => {
  const page = makeAutomationPage({ entryCount: 1, choiceGroupCount: 14, choiceSelectionWorks: false });
  assert.equal(page.send({ type: 'UM_PASS_START' }).ok, true);
  page.advance(5000);

  const state = page.send({ type: 'UM_PASS_INSPECT' }).automation;
  assert.equal(state.phase, 'done');
  assert.equal(state.skipped, 1);
  assert.match(state.message, /1 need manual review/);
  assert.equal(page.sendClicks, 0);
});

test('Start skips one unrecognized form and submits the next', () => {
  const page = makeAutomationPage({ entryCount: 2, unrecognizedEntry: 0 });
  assert.equal(page.send({ type: 'UM_PASS_START' }).ok, true);
  page.advance(30000);

  const state = page.send({ type: 'UM_PASS_INSPECT' }).automation;
  assert.equal(state.phase, 'done');
  assert.equal(state.processed, 1);
  assert.equal(state.skipped, 1);
  assert.match(state.message, /Last issue: The selected entry did not open a recognized answer form/);
  assert.equal(page.sendClicks, 1);
  assert.equal(page.confirmClicks, 1);
});

test('completed-only listings advance quickly without opening a form', () => {
  const page = makeAutomationPage({ entryCount: 0 });
  assert.equal(page.send({ type: 'UM_PASS_START' }).ok, true);
  page.advance(2000);

  const state = page.send({ type: 'UM_PASS_INSPECT' }).automation;
  assert.equal(state.phase, 'done');
  assert.equal(state.processed, 0);
  assert.equal(page.sendClicks, 0);
});

test('page controls navigate between forms and sections without full reloads', () => {
  const page = makeAutomationPage({ clientNavigation: true });
  assert.equal(page.send({ type: 'UM_PASS_START' }).ok, true);
  page.advance(5000);

  assert.equal(page.send({ type: 'UM_PASS_INSPECT' }).automation.phase, 'done');
  assert.equal(page.hardNavigations, 0);
  assert.equal(page.confirmClicks, 2);
});

test('a page control that does not navigate falls back to a full reload', () => {
  const page = makeAutomationPage({ clientNavigation: true, stalledBackLink: true, entryCount: 1 });
  assert.equal(page.send({ type: 'UM_PASS_START' }).ok, true);
  page.advance(8000);

  assert.equal(page.send({ type: 'UM_PASS_INSPECT' }).automation.phase, 'done');
  assert.equal(page.hardNavigations, 1);
  assert.equal(page.confirmClicks, 1);
});

test('a Pending listing without an answer button stops instead of skipping', () => {
  const page = makeAutomationPage({ entryCount: 0, listingStatus: 'Pending' });
  assert.equal(page.send({ type: 'UM_PASS_START' }).ok, true);
  page.advance(7000);

  const state = page.send({ type: 'UM_PASS_INSPECT' }).automation;
  assert.equal(state.phase, 'error');
  assert.match(state.message, /Pending entries exist/);
  assert.equal(page.sendClicks, 0);
});

test('automation stops when Send Answer has no confirmation', () => {
  const page = makeAutomationPage({ hasConfirm: false });
  assert.equal(page.send({ type: 'UM_PASS_START' }).ok, true);
  page.advance(30000);

  const state = page.send({ type: 'UM_PASS_INSPECT' }).automation;
  assert.equal(state.phase, 'error');
  assert.match(state.message, /No confirmation button/);
  assert.equal(page.sendClicks, 1);
  assert.equal(page.confirmClicks, 0);
  assert.equal(page.submitted, false);
});

test('comment and improvement fields are both changed to N/A', () => {
  const page = makeAutomationPage();
  assert.equal(page.send({ type: 'UM_PASS_START' }).ok, true);
  page.advance(60000);

  const state = page.send({ type: 'UM_PASS_INSPECT' }).automation;
  assert.equal(state.phase, 'done');
  assert.deepEqual(page.commentValues, ['N/A', 'N/A']);
  assert.equal(page.sendClicks, 2);
});

test('Start fills N/A for an organization name and still submits a rating', () => {
  const page = makeAutomationPage({ entryCount: 1, initialOrganization: '' });
  assert.equal(page.send({ type: 'UM_PASS_START' }).ok, true);
  page.advance(5000);

  const state = page.send({ type: 'UM_PASS_INSPECT' }).automation;
  assert.equal(state.phase, 'done');
  assert.equal(state.processed, 1);
  assert.equal(page.organizationValue, 'N/A');
  assert.deepEqual(page.selectedRatings, ['5']);
  assert.deepEqual(page.commentValues, ['N/A', 'N/A']);
  assert.equal(page.confirmClicks, 1);
});

test('Start selects N/A from an organization dropdown and still rates', () => {
  const page = makeAutomationPage({
    entryCount: 1, initialOrganization: '', organizationDropdown: true
  });
  assert.equal(page.send({ type: 'UM_PASS_START' }).ok, true);
  page.advance(5000);

  const state = page.send({ type: 'UM_PASS_INSPECT' }).automation;
  assert.equal(state.phase, 'done');
  assert.equal(state.processed, 1);
  assert.equal(page.organizationValue, 'na');
  assert.deepEqual(page.selectedRatings, ['5']);
});

test('a blank Laboratory dropdown is set to CCE Data Communication Laboratory', () => {
  const page = makeAutomationPage({ initialLaboratory: '' });
  assert.equal(page.send({ type: 'UM_PASS_START' }).ok, true);
  page.advance(60000);

  const state = page.send({ type: 'UM_PASS_INSPECT' }).automation;
  assert.equal(state.phase, 'done');
  assert.equal(state.processed, 2);
  assert.equal(page.laboratoryValue, 'CCE Data Communication Laboratory');
  assert.equal(page.sendClicks, 2);
});

test('an existing different Laboratory selection is replaced with CCE Data Communication Laboratory', () => {
  const page = makeAutomationPage({ initialLaboratory: 'Other Laboratory' });
  assert.equal(page.send({ type: 'UM_PASS_START' }).ok, true);
  page.advance(60000);

  const state = page.send({ type: 'UM_PASS_INSPECT' }).automation;
  assert.equal(state.phase, 'done');
  assert.equal(page.laboratoryValue, 'CCE Data Communication Laboratory');
  assert.equal(page.sendClicks, 2);
});

test('Fill current form sets N/A comments and the fixed laboratory', () => {
  const page = makeAutomationPage({ initialLaboratory: 'Other Laboratory' });
  page.openFirstForm();

  const result = page.send({ type: 'UM_PASS_FILL', config: { comment: 'Old setting' } });
  assert.equal(result.commentFilled, 2);
  assert.equal(result.labPending, true);
  page.advance(2000);

  assert.deepEqual(page.commentValues, ['N/A', 'N/A']);
  assert.equal(page.laboratoryValue, 'CCE Data Communication Laboratory');
});

test('auto-fill also sets N/A comments and the fixed laboratory', () => {
  const page = makeAutomationPage({ autoFill: true, initialLaboratory: 'Other Laboratory' });
  page.openFirstForm();
  page.advance(2000);

  assert.deepEqual(page.commentValues, ['N/A', 'N/A']);
  assert.equal(page.laboratoryValue, 'CCE Data Communication Laboratory');
  assert.equal(page.sendClicks, 0);
});

test('the run skips forms when CCE Data Communication Laboratory is unavailable', () => {
  const page = makeAutomationPage({ initialLaboratory: '', laboratoryAvailable: false });
  assert.equal(page.send({ type: 'UM_PASS_START' }).ok, true);
  page.advance(30000);

  const state = page.send({ type: 'UM_PASS_INSPECT' }).automation;
  assert.equal(state.phase, 'done');
  assert.equal(state.skipped, 2);
  assert.match(state.message, /2 need manual review/);
  assert.equal(page.sendClicks, 0);
});

test('an incomplete confirmation dialog stops before the final click', () => {
  const page = makeAutomationPage({ dialogIncomplete: true });
  assert.equal(page.send({ type: 'UM_PASS_START' }).ok, true);
  page.advance(30000);

  const state = page.send({ type: 'UM_PASS_INSPECT' }).automation;
  assert.equal(state.phase, 'error');
  assert.match(state.message, /unanswered questions/);
  assert.equal(page.sendClicks, 1);
  assert.equal(page.confirmClicks, 0);
});

test('an unverified submission stops before opening another entry', () => {
  const page = makeAutomationPage({ hasSuccess: false });
  assert.equal(page.send({ type: 'UM_PASS_START' }).ok, true);
  page.advance(40000);

  const state = page.send({ type: 'UM_PASS_INSPECT' }).automation;
  assert.equal(state.phase, 'error');
  assert.match(state.message, /could not be verified/);
  assert.equal(state.processed, 0);
  assert.equal(page.sendClicks, 1);
  assert.equal(page.confirmClicks, 1);
});
