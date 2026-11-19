/* UM-PASS Survey Filler 1.2
 * Works only on the page the user is viewing. Uses native UI events, never
 * touches submit controls or sends requests. Unknown answers remain for review.
 */
(() => {
  'use strict';

  const STORAGE_KEY = 'umpassSurveyFiller';
  const BASE = '/feedback-form/';
  const plans = new Map();
  const SITE = 'umpass.umindanao.edu.ph';
  const knownSections = ['survey', 'course-assessment', 'evaluation'];
  const SCORE_LABELS = [
    [/\bstrongly\s+agree\b|\bvery\s+satisfied\b|\bexcellent\b|\boutstanding\b|\balways\b|\bextremely\s+(?:likely|satisfied)\b/i, 5],
    [/\bagree\b|\bsatisfied\b|\bvery\s+good\b|\boften\b|\blikely\b/i, 4],
    [/\bneutral\b|\bneither\b|\bfair\b|\bsometimes\b/i, 3],
    [/\bstrongly\s+disagree\b|\bvery\s+dissatisfied\b|\bnever\b/i, 1],
    [/\bdisagree\b|\bdissatisfied\b|\bpoor\b|\brarely\b/i, 2]
  ];

  const text = element => (element?.textContent || '').replace(/\s+/g, ' ').trim();
  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const isSupported = () => location.hostname === SITE && location.pathname.startsWith(BASE);

  function isVisible(element) {
    if (!element || element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
    const target = element.matches('input[type="radio"]')
      ? element.closest('.v-selection-control, label') || element
      : element;
    const style = getComputedStyle(target);
    return style.display !== 'none' && style.visibility !== 'hidden' && target.getClientRects().length > 0;
  }

  function usable(element) {
    return isVisible(element) && !element.disabled && element.getAttribute('aria-disabled') !== 'true';
  }

  function labelText(element) {
    const label = element.closest('label') || (element.id && document.querySelector(`label[for="${CSS.escape(element.id)}"]`));
    return normalize(label?.textContent || element.closest('.v-selection-control')?.textContent || '');
  }

  function scoreOf(element) {
    const candidates = [element.getAttribute('value'), element.getAttribute('data-value'),
      element.getAttribute('aria-label'), element.getAttribute('title'),
      labelText(element), text(element)];
    for (const raw of candidates) {
      const value = normalize(raw);
      if (!value) continue;
      const numeric = value.match(/^([1-5])(?:\s*$|\s*[-–.:)]\s*|\s+\D)/);
      if (numeric) return Number(numeric[1]);
      for (const [regex, score] of SCORE_LABELS) {
        if (regex.test(value)) return score;
      }
    }
    return null;
  }

  function selected(element) {
    return Boolean(element.checked || element.getAttribute('aria-checked') === 'true' ||
      element.getAttribute('aria-pressed') === 'true' ||
      element.classList.contains('v-btn--active') ||
      element.classList.contains('v-item--active') ||
      element.closest('.v-selection-control--dirty'));
  }

  function ratingGroup(elements, container) {
    const options = [...elements].filter(usable).map(element => ({ element, score: scoreOf(element) }));
    const found = new Set(options.map(option => option.score));
    if (options.length < 4 || !found.has(4) || !found.has(5) ||
        found.size < 4 || options.some(option => option.score === null)) return null;
    return {
      container,
      anchor: options[0].element,
      answered: () => options.some(option => selected(option.element)),
      choose(score) {
        const option = options.find(item => item.score === score);
        if (!option) return false;
        if (!selected(option.element)) option.element.click();
        return true;
      }
    };
  }

  function setNativeValue(element, value) {
    const proto = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype
      : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function collectRatingGroups() {
    const groups = [];
    const seen = new Set();

    // Native UM-PASS rating buttons, generic accessible radio controls,
    // and Vuetify radio/toggle groups on unseen evaluation layouts.
    const containers = document.querySelectorAll(
      '.rating-options, [role="radiogroup"], .v-radio-group, ' +
      '.v-selection-control-group, .v-btn-toggle, .v-input--radio-group, fieldset'
    );
    for (const container of containers) {
      if (!isVisible(container)) continue;
      const controls = [...container.querySelectorAll('button, input[type="radio"], [role="radio"]')]
        .filter(element => !seen.has(element));
      const group = ratingGroup(controls, container);
      if (!group) continue;
      groups.push(group);
      controls.forEach(control => seen.add(control));
    }

    const byName = new Map();
    for (const input of document.querySelectorAll('input[type="radio"][name]')) {
      if (seen.has(input)) continue;
      if (!byName.has(input.name)) byName.set(input.name, []);
      byName.get(input.name).push(input);
    }
    for (const inputs of byName.values()) {
      const group = ratingGroup(inputs, inputs[0].closest('fieldset') || inputs[0].parentElement);
      if (!group) continue;
      groups.push(group);
      inputs.forEach(input => seen.add(input));
    }

    // Standard HTML select elements with a complete 1–5 scale.
    for (const element of document.querySelectorAll('select:not([disabled])')) {
      if (!isVisible(element)) continue;
      const options = [...element.options]
        .filter(option => !option.disabled)
        .map(option => ({ score: scoreOf(option), value: option.value }));
      const scores = new Set(options.map(option => option.score));
      if (scores.size < 4 || !scores.has(4) || !scores.has(5)) continue;
      groups.push({
        container: element,
        anchor: element,
        answered: () => options.some(option => option.value === element.value && option.score !== null),
        choose(score) {
          const option = options.find(item => item.score === score);
          if (!option) return false;
          if (element.value !== option.value) setNativeValue(element, option.value);
          return true;
        }
      });
    }

    return groups.sort((a, b) => a.anchor === b.anchor ? 0 :
      a.anchor.compareDocumentPosition(b.anchor) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
  }

  function randomInt(max) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] % max;
  }

  function makePlan(count) {
    // Balance 4s and 5s. Randomize their order, avoiding three equal scores
    // in a row; a new form gets a fresh plan with the same distribution.
    if (!count) return [];
    const startFive = randomInt(2) === 0;
    const fiveCount = Math.floor(count / 2) + ((count % 2 && startFive) ? 1 : 0);
    const base = [...Array(fiveCount).fill(5), ...Array(count - fiveCount).fill(4)];
    for (let attempt = 0; attempt < 250; attempt++) {
      const shuffled = [...base];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      if (!shuffled.some((v, i) => i >= 2 && shuffled[i - 1] === v && shuffled[i - 2] === v)) {
        return shuffled;
      }
    }
    // Fallback preserves balance while alternating with a random first score.
    return Array.from({ length: count }, (_, i) => ((i + Number(startFive)) % 2 ? 5 : 4));
  }

  function planFor(count, fresh) {
    const key = `${location.pathname}${location.search}`;
    if (fresh || !plans.has(key) || plans.get(key).length !== count) plans.set(key, makePlan(count));
    return plans.get(key);
  }

  function questionContext(element) {
    const names = [element.getAttribute('aria-label'), element.getAttribute('placeholder'),
      element.getAttribute('name'), element.getAttribute('id')];
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      for (const id of labelledBy.split(/\s+/)) names.push(text(document.getElementById(id)));
    }
    names.push(labelText(element));
    const block = element.closest(
      'fieldset, [data-question-id], .survey-question, .question-item, .question-card, ' +
      '.form-group, .v-input, .v-field, .question'
    );
    if (block && text(block).length < 450) names.push(text(block));
    const container = element.closest('fieldset, .survey-question, .question-card, .form-group');
    if (container) names.push(text(container.querySelector('legend, label, .question-title, .question-text')));
    return normalize(names.filter(Boolean).join(' ')).slice(0, 600);
  }

  function fieldType(context) {
    if (/\bcampus\b|\bbranch\b/i.test(context)) return 'campus';
    if (/\bvenue\b|\blocation\b|\bbuilding\b|\bfacility\b|\broom\b|\bsite\b|\bwhere\b|\barea\b/i.test(context)) return 'venue';
    if (/\bcollege\b|\bdepartment\b|\bacademic unit\b/i.test(context)) return 'college';
    return null;
  }

  function contextTopic() {
    // Page headings describe the individual survey; avoid blindly using
    // navigation text, which includes unrelated site sections.
    return [...document.querySelectorAll('main h1, main h2, main h3, main h4, .v-main h1, .v-main h2, .v-main h3, .v-main h4, .survey-title, .page-title')]
      .map(element => text(element)).filter(Boolean).slice(0, 18).join(' ').slice(0, 900);
  }

  function choiceKind(label) {
    if (/\bCCE\b|College of Computing Education|Computing Education/i.test(label)) return 'cce';
    if (/\bgym(nasium)?\b|\bsports complex\b|\bsports center\b/i.test(label)) return 'gym';
    if (/\bcomputer (science )?lab(oratory)?\b|\bIT laboratory\b|\blaboratory\b/i.test(label)) return 'lab';
    return null;
  }

  function locationTarget(type, question, choices, config) {
    if (config.locationMode === 'off' || type === 'campus') return null;
    const mode = config.locationMode || 'smart';
    let preferred = null;
    if (type === 'college') preferred = 'cce';
    else if (mode === 'cce' || mode === 'gym') preferred = mode;
    else {
      const source = `${question} ${contextTopic()}`;
      if (/intramural|sports|athletics|basketball|volleyball|physical education/i.test(source)) preferred = 'gym';
      else if (/laboratory|computer lab|\bCS\s*\d+\b|computing/i.test(source)) preferred = 'lab';
    }
    if (!preferred) return null;
    // Never substitute CCE for a laboratory venue, or guess a campus.
    return choices.find(choice => choiceKind(choice.label) === preferred) || null;
  }

  function collectLocationFields(config) {
    const fields = [];
    const handled = new Set();
    const already = el => el.checked || el.getAttribute('aria-checked') === 'true';

    for (const select of document.querySelectorAll('select:not([disabled])')) {
      if (!usable(select)) continue;
      const context = questionContext(select);
      const type = fieldType(context);
      if (!type) continue;
      const choices = [...select.options].filter(option => option.value !== '' && !option.disabled)
        .map(option => ({ label: text(option), value: option.value }));
      // Rating scale selects are not location fields.
      if (choices.filter(choice => /^(?:[1-5])$/.test(choice.label)).length >= 4) continue;
      const target = locationTarget(type, context, choices, config);
      fields.push({
        type, target, hasAnswer: () => select.value !== '' && select.selectedIndex > 0,
        choose: () => { setNativeValue(select, target.value); return true; }
      });
    }

    const byName = new Map();
    for (const input of document.querySelectorAll('input[type="radio"][name]')) {
      if (!usable(input)) continue;
      if (!byName.has(input.name)) byName.set(input.name, []);
      byName.get(input.name).push(input);
    }
    for (const radios of byName.values()) {
      if (radios.length < 2) continue;
      const context = questionContext(radios[0]);
      const type = fieldType(context);
      if (!type) continue;
      const choices = radios.map(input => ({
        input, label: labelText(input) || input.getAttribute('aria-label') || input.value
      }));
      const target = locationTarget(type, context, choices, config);
      fields.push({
        type, target, hasAnswer: () => radios.some(already),
        choose: () => { target.input.click(); return true; }
      });
      radios.forEach(input => handled.add(input));
    }

    // Simple free-text college/venue fields. Only insert a known answer.
    for (const input of document.querySelectorAll('input[type="text"], textarea')) {
      if (!usable(input) || input.readOnly || handled.has(input)) continue;
      const question = questionContext(input);
      const type = fieldType(question);
      if (!type) continue;
      const target = locationTarget(type, question,
        [{ label: 'CCE', value: 'CCE' }, { label: 'Gymnasium', value: 'Gymnasium' }, { label: 'Laboratory', value: 'Laboratory' }], config);
      fields.push({
        type, target, hasAnswer: () => Boolean(input.value.trim()),
        choose: () => { setNativeValue(input, target.value); return true; }
      });
    }
    return fields;
  }

  function fillComment(comment, overwrite) {
    const value = normalize(comment);
    if (!value) return false;
    for (const textarea of document.querySelectorAll('textarea:not([readonly]):not([disabled])')) {
      if (!usable(textarea) || textarea.id?.endsWith('-sizer')) continue;
      const context = questionContext(textarea);
      if (!/comment|feedback|suggestion|remark/i.test(context) ||
          /\bcampus\b|\bcollege\b|\bvenue\b/i.test(context)) continue;
      if (!overwrite && textarea.value.trim()) continue;
      const limit = textarea.maxLength > 0 ? textarea.maxLength : 350;
      setNativeValue(textarea, value.slice(0, limit));
      return true;
    }
    return false;
  }

  function listingCounts() {
    const counts = { pending: 0, completed: 0, locked: 0 };
    const main = document.querySelector('.v-main, main') || document;
    const items = main.querySelectorAll('.v-chip__content, .status-chip, [data-status]');
    for (const item of items) {
      const value = normalize(text(item) || item.getAttribute('data-status')).toLowerCase();
      if (Object.prototype.hasOwnProperty.call(counts, value)) counts[value]++;
    }
    return counts;
  }

  function section() {
    const path = location.pathname;
    if (path.startsWith(`${BASE}survey`)) return 'Survey';
    if (path.startsWith(`${BASE}course-assessment`)) return 'Course Delivery';
    if (path.startsWith(`${BASE}evaluation`)) return 'Performance';
    return 'UM-PASS feedback';
  }

  function inspect(config = {}) {
    if (!isSupported()) return { ok: false, supported: false };
    const ratings = collectRatingGroups();
    const locations = collectLocationFields(config);
    const path = location.pathname;
    const isList = knownSections.map(name => `${BASE}${name}`)
      .includes(path.replace(/\/$/, ''));
    const counts = isList ? listingCounts() : null;
    return {
      ok: true, supported: true, section: section(), isList,
      total: ratings.length,
      answered: ratings.filter(group => group.answered()).length,
      unanswered: ratings.filter(group => !group.answered()).length,
      locations: locations.length,
      suggestedLocations: locations.filter(field => field.target && !field.hasAnswer()).length,
      counts,
      pageTitle: document.title
    };
  }

  function fill({ config = {}, overwrite = false, fresh = false }) {
    if (!isSupported()) return { ok: false, error: 'Open a UM-PASS feedback form first.' };
    if (knownSections.map(name => `${BASE}${name}`)
      .includes(location.pathname.replace(/\/$/, ''))) {
      return { ok: true, total: 0, filled: 0, note: 'This is a survey list. Open an available individual answer form.' };
    }

    const groups = collectRatingGroups();
    const plan = planFor(groups.length, fresh);
    let filled = 0, existing = 0, skippedRatings = 0;
    for (let index = 0; index < groups.length; index++) {
      const group = groups[index];
      if (group.answered() && !overwrite) { existing++; continue; }
      if (group.choose(plan[index])) filled++;
      else skippedRatings++;
    }

    let locationFilled = 0, locationReview = 0;
    for (const field of collectLocationFields(config)) {
      if (field.hasAnswer()) continue;
      if (field.target) { if (field.choose()) locationFilled++; }
      else locationReview++;
    }
    const commentFilled = fillComment(config.comment, false);
    return {
      ok: true, total: groups.length, filled, existing, skippedRatings,
      locationFilled, locationReview, commentFilled,
      note: (groups.length || locationFilled)
        ? 'Review all answers and submit manually.'
        : 'No compatible rating questions found. Open an individual answer form.'
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type === 'UM_PASS_INSPECT') respond(inspect(message.config));
    if (message?.type === 'UM_PASS_FILL') respond(fill(message));
  });

  let timeout;
  function schedule() {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      chrome.storage.local.get(STORAGE_KEY, result => {
        const config = result[STORAGE_KEY] || {};
        if (config.autoFill) fill({ config, overwrite: false, fresh: false });
      });
    }, 450);
  }
  const observer = new MutationObserver(mutations => {
    if (mutations.some(mutation => mutation.type === 'childList' &&
      (mutation.addedNodes.length || mutation.removedNodes.length))) schedule();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEY]) schedule();
  });
  window.addEventListener('popstate', schedule);
  window.addEventListener('hashchange', schedule);
  schedule();
})();
