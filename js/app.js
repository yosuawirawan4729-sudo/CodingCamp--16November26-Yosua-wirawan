// Personal Dashboard — app.js

// ---------------------------------------------------------------------------
// Storage Module
// Wraps localStorage with JSON serialization.
// Falls back to a no-op / null when localStorage is unavailable (e.g. private
// browsing mode with storage blocked).
// ---------------------------------------------------------------------------
const Storage = (() => {
  function get(key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // localStorage unavailable — silently ignore
    }
  }

  return { get, set };
})();

// ---------------------------------------------------------------------------
// Greeting Module
// Displays the current time, date, and a time-of-day greeting.
// Updates every second via setInterval.
// ---------------------------------------------------------------------------
const GreetingModule = (() => {
  let _timeEl = null;
  let _dateEl = null;
  let _greetingEl = null;

  /**
   * Pure function — maps an hour (0–23) to one of four greeting strings.
   * @param {number} hour
   * @returns {string}
   */
  function classifyGreeting(hour) {
    if (hour >= 5 && hour <= 11) return 'Good Morning';
    if (hour >= 12 && hour <= 17) return 'Good Afternoon';
    if (hour >= 18 && hour <= 20) return 'Good Evening';
    return 'Good Night'; // 21–23 and 0–4
  }

  /**
   * Reads the current Date, formats time/date, updates DOM elements.
   * Guards gracefully when elements are absent (e.g. during unit tests).
   */
  function tick() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;

    const dateStr = now.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const greeting = classifyGreeting(now.getHours());

    if (_timeEl) _timeEl.textContent = timeStr;
    if (_dateEl) _dateEl.textContent = dateStr;
    if (_greetingEl) _greetingEl.textContent = greeting;
  }

  /**
   * Wires DOM references and starts the one-second interval.
   * Calls tick() once immediately so the display is populated on load.
   */
  function init() {
    _timeEl = document.getElementById('time-display');
    _dateEl = document.getElementById('date-display');
    _greetingEl = document.getElementById('greeting-text');

    tick();
    setInterval(tick, 1000);
  }

  return { init, tick, classifyGreeting };
})();

// ---------------------------------------------------------------------------
// Timer Module
// Pomodoro focus countdown timer.
// State: { durationMinutes, remainingSeconds, running }
// ---------------------------------------------------------------------------
const TimerModule = (() => {
  const STORAGE_KEY = 'pd_timer_duration';
  const DEFAULT_DURATION = 25;
  const MIN_DURATION = 1;
  const MAX_DURATION = 120;

  let _intervalId = null;

  const state = {
    durationMinutes: DEFAULT_DURATION,
    remainingSeconds: DEFAULT_DURATION * 60,
    running: false,
  };

  // ── DOM helpers ──────────────────────────────────────────────────────────

  function _el(id) {
    return (typeof document !== 'undefined') ? document.getElementById(id) : null;
  }

  /**
   * Formats seconds as MM:SS and pushes it to #timer-display.
   */
  function _updateDisplay() {
    const el = _el('timer-display');
    if (!el) return;
    const m = String(Math.floor(state.remainingSeconds / 60)).padStart(2, '0');
    const s = String(state.remainingSeconds % 60).padStart(2, '0');
    el.textContent = `${m}:${s}`;
  }

  /**
   * Shows or clears an inline validation message in #timer-error.
   * @param {string} message  Empty string clears the error.
   */
  function _setError(message) {
    const el = _el('timer-error');
    if (!el) return;
    el.textContent = message;
  }

  /**
   * Shows or hides the "time's up" notification in #timer-notification.
   * @param {boolean} visible
   */
  function _setNotification(visible) {
    const el = _el('timer-notification');
    if (!el) return;
    if (visible) {
      el.textContent = "Time's up!";
      el.removeAttribute('hidden');
      el.classList.add('active');
    } else {
      el.textContent = '';
      el.setAttribute('hidden', '');
      el.classList.remove('active');
    }
  }

  // ── Core API ─────────────────────────────────────────────────────────────

  /**
   * Validates minutes (1–120), updates state, persists via Storage.
   * Does NOT start or stop the timer.
   * @param {number} minutes
   * @returns {{ ok: boolean, error?: string }}
   */
  function setDuration(minutes) {
    if (
      typeof minutes !== 'number' ||
      !Number.isInteger(minutes) ||
      minutes < MIN_DURATION ||
      minutes > MAX_DURATION
    ) {
      return { ok: false, error: `Duration must be a whole number between ${MIN_DURATION} and ${MAX_DURATION} minutes.` };
    }
    state.durationMinutes = minutes;
    state.remainingSeconds = minutes * 60;
    Storage.set(STORAGE_KEY, minutes);
    _setError('');
    _updateDisplay();
    return { ok: true };
  }

  /**
   * Starts the countdown. Guards against double-start.
   */
  function start() {
    if (state.running) return;
    if (state.remainingSeconds <= 0) return; // already expired
    _setNotification(false);
    state.running = true;
    Storage.set(STORAGE_KEY, state.durationMinutes);
    _intervalId = (typeof setInterval !== 'undefined')
      ? setInterval(onTick, 1000)
      : null;
  }

  /**
   * Pauses the countdown, retaining remainingSeconds.
   */
  function stop() {
    if (_intervalId !== null) {
      clearInterval(_intervalId);
      _intervalId = null;
    }
    state.running = false;
  }

  /**
   * Stops the countdown and restores remainingSeconds to the full duration.
   */
  function reset() {
    stop();
    state.remainingSeconds = state.durationMinutes * 60;
    _setNotification(false);
    _updateDisplay();
  }

  /**
   * Called by setInterval every second while the timer is running.
   * Decrements remainingSeconds; triggers onExpire when it reaches 0.
   */
  function onTick() {
    if (state.remainingSeconds > 0) {
      state.remainingSeconds -= 1;
    }
    _updateDisplay();
    if (state.remainingSeconds === 0) {
      onExpire();
    }
  }

  /**
   * Fires exactly once when the countdown reaches 0.
   * Stops the timer and shows a visual notification.
   */
  function onExpire() {
    stop(); // clears interval and sets running = false
    _setNotification(true);
  }

  /**
   * Restores saved duration from Storage, wires DOM event listeners.
   * Falls back to DEFAULT_DURATION when stored value is missing or invalid.
   */
  function init() {
    const saved = Storage.get(STORAGE_KEY);
    const parsed = Number(saved);
    if (
      saved !== null &&
      Number.isInteger(parsed) &&
      parsed >= MIN_DURATION &&
      parsed <= MAX_DURATION
    ) {
      state.durationMinutes = parsed;
    } else {
      state.durationMinutes = DEFAULT_DURATION;
    }
    state.remainingSeconds = state.durationMinutes * 60;
    state.running = false;

    _updateDisplay();

    // Wire up buttons — null-guarded so unit tests run without a DOM
    const startBtn  = _el('timer-start');
    const stopBtn   = _el('timer-stop');
    const resetBtn  = _el('timer-reset');
    const submitBtn = _el('timer-duration-submit');
    const input     = _el('timer-duration-input');

    if (startBtn)  startBtn.addEventListener('click', start);
    if (stopBtn)   stopBtn.addEventListener('click', stop);
    if (resetBtn)  resetBtn.addEventListener('click', reset);

    if (submitBtn && input) {
      submitBtn.addEventListener('click', () => {
        const val = parseInt(input.value, 10);
        const result = setDuration(val);
        if (!result.ok) {
          _setError(result.error);
        }
      });
    }
  }

  return { init, start, stop, reset, setDuration, onTick, onExpire, state };
})();

// ---------------------------------------------------------------------------
// Todo Module
// Manages a list of tasks with add / edit / toggle / delete / sort operations.
// All mutations persist the full task array to localStorage via Storage.
// ---------------------------------------------------------------------------
const TodoModule = (() => {
  const STORAGE_KEY = 'pd_tasks';

  /** @type {Array<{id: string, name: string, complete: boolean}>} */
  let _tasks = [];

  // ── DOM helper ────────────────────────────────────────────────────────────

  function _el(id) {
    return (typeof document !== 'undefined') ? document.getElementById(id) : null;
  }

  /**
   * Shows or clears an inline validation message in #todo-error.
   * @param {string} message  Empty string clears the error.
   */
  function _setError(message) {
    const el = _el('todo-error');
    if (!el) return;
    el.textContent = message;
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  function _persist() {
    Storage.set(STORAGE_KEY, _tasks);
  }

  // ── Pure helpers ─────────────────────────────────────────────────────────

  /**
   * Returns true when `name` (trimmed, lowercased) already exists in the task
   * list, optionally excluding the task with `excludeId`.
   * @param {string} name
   * @param {string|null} excludeId
   * @returns {boolean}
   */
  function _isDuplicate(name, excludeId) {
    const lower = name.trim().toLowerCase();
    return _tasks.some(
      (t) => t.name.toLowerCase() === lower && t.id !== excludeId
    );
  }

  // ── Core API ─────────────────────────────────────────────────────────────

  /**
   * Adds a new task. Trims name, rejects empty/whitespace-only and duplicates.
   * @param {string} name
   * @returns {{ ok: boolean, error?: string }}
   */
  function addTask(name) {
    const trimmed = (name || '').trim();

    if (trimmed.length === 0) {
      return { ok: false, error: 'Task name cannot be empty.' };
    }

    if (_isDuplicate(trimmed, null)) {
      return { ok: false, error: 'A task with that name already exists.' };
    }

    const id =
      (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : Date.now().toString();

    _tasks.push({ id, name: trimmed, complete: false });
    _persist();
    render();
    return { ok: true };
  }

  /**
   * Edits an existing task's name.
   * Rejects empty names and duplicates (excluding the task being edited).
   * @param {string} id
   * @param {string} newName
   * @returns {{ ok: boolean, error?: string }}
   */
  function editTask(id, newName) {
    const trimmed = (newName || '').trim();

    if (trimmed.length === 0) {
      return { ok: false, error: 'Task name cannot be empty.' };
    }

    if (_isDuplicate(trimmed, id)) {
      return { ok: false, error: 'A task with that name already exists.' };
    }

    const task = _tasks.find((t) => t.id === id);
    if (!task) {
      return { ok: false, error: 'Task not found.' };
    }

    task.name = trimmed;
    _persist();
    render();
    return { ok: true };
  }

  /**
   * Flips the `complete` boolean for the task with the given id.
   * @param {string} id
   */
  function toggleTask(id) {
    const task = _tasks.find((t) => t.id === id);
    if (!task) return;
    task.complete = !task.complete;
    _persist();
    render();
  }

  /**
   * Removes the task with the given id.
   * @param {string} id
   */
  function deleteTask(id) {
    _tasks = _tasks.filter((t) => t.id !== id);
    _persist();
    render();
  }

  /**
   * Reorders the internal task array in place according to the given sort option.
   * Does not change task count or ids.
   * @param {"alpha-asc"|"alpha-desc"|"incomplete-first"|"complete-first"} option
   */
  function sortTasks(option) {
    switch (option) {
      case 'alpha-asc':
        _tasks.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'alpha-desc':
        _tasks.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'incomplete-first':
        _tasks.sort((a, b) => Number(a.complete) - Number(b.complete));
        break;
      case 'complete-first':
        _tasks.sort((a, b) => Number(b.complete) - Number(a.complete));
        break;
      default:
        return; // unknown option — no-op
    }
    _persist();
    render();
  }

  /**
   * Renders the current task list to the DOM.
   * Target element: #todo-list
   * Each task item contains: name, toggle button, edit button, delete button.
   * Complete tasks receive the class "complete".
   */
  function render() {
    const listEl = _el('todo-list');
    if (!listEl) return;

    listEl.innerHTML = '';

    _tasks.forEach((task) => {
      const li = document.createElement('li');
      li.className = 'todo-item' + (task.complete ? ' complete' : '');
      li.dataset.id = task.id;

      // Task name span
      const nameSpan = document.createElement('span');
      nameSpan.className = 'todo-name';
      nameSpan.textContent = task.name;

      // Toggle (complete/incomplete) button
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'todo-toggle';
      toggleBtn.textContent = task.complete ? '↩' : '✓';
      toggleBtn.setAttribute('aria-label', task.complete ? 'Mark incomplete' : 'Mark complete');
      toggleBtn.addEventListener('click', () => toggleTask(task.id));

      // Edit button
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'todo-edit';
      editBtn.textContent = '✎';
      editBtn.setAttribute('aria-label', 'Edit task');
      editBtn.addEventListener('click', () => _startInlineEdit(li, task));

      // Delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'todo-delete';
      deleteBtn.textContent = '✕';
      deleteBtn.setAttribute('aria-label', 'Delete task');
      deleteBtn.addEventListener('click', () => deleteTask(task.id));

      li.appendChild(nameSpan);
      li.appendChild(toggleBtn);
      li.appendChild(editBtn);
      li.appendChild(deleteBtn);
      listEl.appendChild(li);
    });
  }

  /**
   * Replaces the name span with an inline text input for editing.
   * Saves on Enter or blur; cancels on Escape.
   * @param {HTMLElement} li
   * @param {{ id: string, name: string }} task
   */
  function _startInlineEdit(li, task) {
    const nameSpan = li.querySelector('.todo-name');
    if (!nameSpan) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'todo-edit-input';
    input.value = task.name;

    li.replaceChild(input, nameSpan);
    input.focus();
    input.select();

    function _commit() {
      const result = editTask(task.id, input.value);
      if (!result.ok) {
        // Show error and restore input so user can correct it
        _setError(result.error || 'Invalid name.');
        input.focus();
      } else {
        _setError('');
        // render() was already called inside editTask
      }
    }

    function _cancel() {
      render(); // restore original view
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); _commit(); }
      if (e.key === 'Escape') { _cancel(); }
    });

    input.addEventListener('blur', () => {
      // Only commit if the input is still in the DOM (not already removed by Enter/Escape)
      if (input.isConnected) _commit();
    });
  }

  // ── Initialization ────────────────────────────────────────────────────────

  /**
   * Restores tasks from localStorage, wires DOM controls, and renders.
   * Falls back to an empty array if no saved data exists or it is invalid.
   */
  function init() {
    const saved = Storage.get(STORAGE_KEY);
    _tasks = Array.isArray(saved) ? saved : [];

    // Wire add-task form
    const addBtn   = _el('todo-add-btn');
    const addInput = _el('todo-input');
    const sortSel  = _el('todo-sort');

    function _handleAdd() {
      const result = addTask((addInput && addInput.value) || '');
      if (!result.ok) {
        _setError(result.error || 'Invalid input.');
      } else {
        _setError('');
        if (addInput) addInput.value = '';
      }
    }

    if (addBtn) {
      addBtn.addEventListener('click', _handleAdd);
    }

    if (addInput) {
      addInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') _handleAdd();
      });
    }

    if (sortSel) {
      sortSel.addEventListener('change', () => {
        sortTasks(sortSel.value);
      });
    }

    render();
  }

  // ── Expose tasks array for tests ──────────────────────────────────────────

  /**
   * Returns a shallow copy of the internal tasks array.
   * Used by unit/property tests to inspect state without direct mutation.
   * @returns {Array}
   */
  function getTasks() {
    return _tasks.slice();
  }

  return { init, addTask, editTask, toggleTask, deleteTask, sortTasks, render, getTasks };
})();

// ---------------------------------------------------------------------------
// Links Module
// Manages a collection of quick-access links with add / delete / render.
// All mutations persist the full link array to localStorage via Storage.
// ---------------------------------------------------------------------------
const LinksModule = (() => {
  const STORAGE_KEY = 'pd_links';

  /** @type {Array<{id: string, label: string, url: string}>} */
  let _links = [];

  // ── DOM helper ────────────────────────────────────────────────────────────

  function _el(id) {
    return (typeof document !== 'undefined') ? document.getElementById(id) : null;
  }

  /**
   * Shows or clears an inline validation message in #links-error.
   * @param {string} message  Empty string clears the error.
   */
  function _setError(message) {
    const el = _el('links-error');
    if (!el) return;
    el.textContent = message;
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  function _persist() {
    Storage.set(STORAGE_KEY, _links);
  }

  // ── Core API ─────────────────────────────────────────────────────────────

  /**
   * Adds a new link. Trims both args; rejects empty label and invalid URL.
   * @param {string} label
   * @param {string} url
   * @returns {{ ok: boolean, error?: string }}
   */
  function addLink(label, url) {
    const trimmedLabel = (label || '').trim();
    const trimmedUrl   = (url   || '').trim();

    if (trimmedLabel.length === 0) {
      return { ok: false, error: 'Label is required.' };
    }

    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      return { ok: false, error: 'URL must start with http:// or https://.' };
    }

    const id =
      (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : Date.now().toString();

    _links.push({ id, label: trimmedLabel, url: trimmedUrl });
    _persist();
    render();
    return { ok: true };
  }

  /**
   * Removes the link with the given id.
   * @param {string} id
   */
  function deleteLink(id) {
    _links = _links.filter((l) => l.id !== id);
    _persist();
    render();
  }

  /**
   * Renders the current link collection to the DOM.
   * Target element: #links-list
   * Each link is a labeled button that opens the URL in a new tab,
   * paired with a delete button.
   */
  function render() {
    const containerEl = _el('links-list');
    if (!containerEl) return;

    containerEl.innerHTML = '';

    _links.forEach((link) => {
      const item = document.createElement('div');
      item.className = 'link-item';
      item.dataset.id = link.id;

      // Link button — opens URL in a new tab
      const linkBtn = document.createElement('button');
      linkBtn.type = 'button';
      linkBtn.className = 'link-btn';
      linkBtn.textContent = link.label;
      linkBtn.setAttribute('aria-label', `Open ${link.label}`);
      linkBtn.addEventListener('click', () => window.open(link.url, '_blank'));

      // Delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'link-delete';
      deleteBtn.textContent = '✕';
      deleteBtn.setAttribute('aria-label', `Delete ${link.label}`);
      deleteBtn.dataset.id = link.id;
      deleteBtn.addEventListener('click', () => deleteLink(link.id));

      item.appendChild(linkBtn);
      item.appendChild(deleteBtn);
      containerEl.appendChild(item);
    });
  }

  // ── Initialization ────────────────────────────────────────────────────────

  /**
   * Restores links from localStorage, wires DOM controls, and renders.
   * Falls back to an empty array if no saved data exists or it is invalid.
   */
  function init() {
    const saved = Storage.get(STORAGE_KEY);
    _links = Array.isArray(saved) ? saved : [];

    // Wire add-link form
    const addBtn      = _el('links-add-btn');
    const labelInput  = _el('links-label-input');
    const urlInput    = _el('links-url-input');

    function _handleAdd() {
      const result = addLink(
        (labelInput && labelInput.value) || '',
        (urlInput   && urlInput.value)   || ''
      );
      if (!result.ok) {
        _setError(result.error || 'Invalid input.');
      } else {
        _setError('');
        if (labelInput) labelInput.value = '';
        if (urlInput)   urlInput.value   = '';
      }
    }

    if (addBtn) {
      addBtn.addEventListener('click', _handleAdd);
    }

    render();
  }

  // ── Expose links array for tests ──────────────────────────────────────────

  /**
   * Returns a shallow copy of the internal links array.
   * Used by unit/property tests to inspect state without direct mutation.
   * @returns {Array}
   */
  function getLinks() {
    return _links.slice();
  }

  return { init, addLink, deleteLink, render, getLinks };
})();

// ---------------------------------------------------------------------------
// Theme Module
// Manages light / dark theme preference.
// Persists the chosen theme under the key 'pd_theme' via Storage.
// ---------------------------------------------------------------------------
const ThemeModule = (() => {
  const STORAGE_KEY = 'pd_theme';
  const VALID_THEMES = ['light', 'dark'];
  const DEFAULT_THEME = 'light';

  /** @type {'light'|'dark'} */
  let _current = DEFAULT_THEME;

  // ── DOM helper ────────────────────────────────────────────────────────────

  function _el(id) {
    return (typeof document !== 'undefined') ? document.getElementById(id) : null;
  }

  // ── Core API ─────────────────────────────────────────────────────────────

  /**
   * Applies `theme` to the document.
   * - Adds the class `"dark"` to `<body>` for the dark theme; removes it for light.
   * - Updates the text content of `#theme-toggle` to a sun/moon icon so the
   *   button always reflects the *opposite* theme (what will happen on click).
   * @param {'light'|'dark'} theme
   */
  function apply(theme) {
    const body = (typeof document !== 'undefined') ? document.body : null;
    if (body) {
      if (theme === 'dark') {
        body.classList.add('dark');
      } else {
        body.classList.remove('dark');
      }
    }

    // Update toggle button icon: show moon (🌙) when in light mode (switch to dark),
    // show sun (☀️) when in dark mode (switch to light).
    const toggleBtn = _el('theme-toggle');
    if (toggleBtn) {
      toggleBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
      toggleBtn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    }

    _current = theme;
  }

  /**
   * Flips the current theme between `"light"` and `"dark"`,
   * applies it, and persists the new value via Storage.
   */
  function toggle() {
    const next = _current === 'light' ? 'dark' : 'light';
    apply(next);
    Storage.set(STORAGE_KEY, next);
  }

  /**
   * Restores the saved theme from localStorage.
   * Falls back to `"light"` when no value is saved or the saved value is invalid.
   * Applies the resolved theme and wires the click event on `#theme-toggle`.
   */
  function init() {
    const saved = Storage.get(STORAGE_KEY);
    const theme = VALID_THEMES.includes(saved) ? saved : DEFAULT_THEME;

    apply(theme);

    // Wire toggle button — null-guarded so unit tests run without a DOM
    const toggleBtn = _el('theme-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', toggle);
    }
  }

  /**
   * Returns the currently active theme.
   * Used by unit/property tests to inspect state.
   * @returns {'light'|'dark'}
   */
  function getTheme() {
    return _current;
  }

  return { init, toggle, apply, getTheme };
})();

// ---------------------------------------------------------------------------
// App Init
// ThemeModule.init() runs synchronously (before DOMContentLoaded) so the
// correct theme class is applied to <body> before the browser paints,
// preventing a flash of unstyled/wrong-theme content.
// All other modules initialise inside DOMContentLoaded so they can safely
// query DOM elements.
// ---------------------------------------------------------------------------
if (typeof document !== 'undefined') {
  // Apply theme immediately to avoid FOUC
  ThemeModule.init();

  document.addEventListener('DOMContentLoaded', () => {
    GreetingModule.init();
    TimerModule.init();
    TodoModule.init();
    LinksModule.init();
  });
}

// ---------------------------------------------------------------------------
// Module exports (Node / Vitest environment only)
// In a real browser the iife-scoped names are accessed directly.
// ---------------------------------------------------------------------------
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Storage, GreetingModule, TimerModule, TodoModule, LinksModule, ThemeModule };
}
