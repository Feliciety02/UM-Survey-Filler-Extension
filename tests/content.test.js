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

function makePage({ containers = [], selects = [] } = {}) {
  let onMessage;
  const document = {
    documentElement: new Element(),
    title: 'Test survey',
    querySelectorAll(selector) {
      if (selector.startsWith('.rating-options')) return containers;
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
