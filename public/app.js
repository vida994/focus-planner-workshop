const TITLE_MAX = 200;
const GOAL_MAX = 2000;
const MINUTES_MAX = 1440;
const CONTEXTS = ['laptop', 'phone', 'anywhere'];
const SUBMIT_GUARD_MS = 500;
const AI_TIMEOUT_MS = 30000;
const STORAGE_KEY = 'focus-planner-tasks';
const DATA_VERSION = 1;

const form = document.querySelector('#add-form');
const formHeading = document.querySelector('#form-heading');
const entryInput = document.querySelector('#entry-text');
const entryLabel = document.querySelector('#entry-label');
const entryCount = document.querySelector('#entry-count');
const entryLimit = document.querySelector('#entry-limit');
const entryError = document.querySelector('#entry-error');
const minutesInput = document.querySelector('#task-minutes');
const minutesError = document.querySelector('#minutes-error');
const formError = document.querySelector('#form-error');
const addButton = document.querySelector('#add-button');
const taskOnly = document.querySelector('#task-only');
const estimateButton = document.querySelector('#estimate-button');
const breakdownButton = document.querySelector('#breakdown-button');
const aiExample = document.querySelector('#ai-example');
const aiWaiting = document.querySelector('#ai-waiting');
const aiWaitingText = document.querySelector('#ai-waiting-text');
const aiCancel = document.querySelector('#ai-cancel');
const aiError = document.querySelector('#ai-error');
const estimateProposal = document.querySelector('#estimate-proposal');
const estimateProposalText = document.querySelector('#estimate-proposal-text');
const acceptEstimate = document.querySelector('#accept-estimate');
const reviewSection = document.querySelector('#review-section');
const reviewGoal = document.querySelector('#review-goal');
const discardBanner = document.querySelector('#discard-banner');
const discardConfirm = document.querySelector('#discard-confirm');
const discardCancel = document.querySelector('#discard-cancel');
const suggestionList = document.querySelector('#suggestion-list');
const reviewError = document.querySelector('#review-error');
const addSelectedButton = document.querySelector('#add-selected');
const unfinishedEmpty = document.querySelector('#unfinished-empty');
const unfinishedEmptyText = document.querySelector('#unfinished-empty-text');
const emptyAllTimesButton = document.querySelector('#empty-all-times');
const unfinishedList = document.querySelector('#unfinished-list');
const completedSection = document.querySelector('#completed-section');
const completedCount = document.querySelector('#completed-count');
const completedList = document.querySelector('#completed-list');
const undoBanner = document.querySelector('#undo-banner');
const undoMessage = document.querySelector('#undo-message');
const undoButton = document.querySelector('#undo-button');
const filterButtons = document.querySelectorAll('[data-preset]');
const otherFilterButton = document.querySelector('#other-filter-button');
const allTimesButton = document.querySelector('#all-times-button');
const customFilterForm = document.querySelector('#custom-filter-form');
const customMinutesInput = document.querySelector('#custom-minutes');
const customMinutesError = document.querySelector('#custom-minutes-error');
const activeTime = document.querySelector('#active-time');
const filterNotice = document.querySelector('#filter-notice');
const filterNoticeText = document.querySelector('#filter-notice-text');
const filterNoticeButton = document.querySelector('#filter-notice-button');
const filterGuidance = document.querySelector('#filter-guidance');
const storageBanner = document.querySelector('#storage-banner');
const storageBannerText = document.querySelector('#storage-banner-text');
const storageConfirm = document.querySelector('#storage-confirm');
const storageConfirmText = document.querySelector('#storage-confirm-text');
const storageConfirmYes = document.querySelector('#storage-confirm-yes');
const storageConfirmNo = document.querySelector('#storage-confirm-no');
const storageError = document.querySelector('#storage-error');
const retrySaveButton = document.querySelector('#retry-save');
const exportCopyButton = document.querySelector('#export-copy');
const reloadSavedButton = document.querySelector('#reload-saved');
const recoverRestoreButton = document.querySelector('#recover-restore');
const startEmptyButton = document.querySelector('#start-empty');
const exportBackupButton = document.querySelector('#export-backup');
const restoreBackupButton = document.querySelector('#restore-backup');
const restoreFileInput = document.querySelector('#restore-file');
const completedDetails = document.querySelector('#completed-details');

const tasks = [];
let mode = 'task';
let editingId = null;
let editDraft = null;
let pendingDeleteId = null;
let lastCompletedId = null;
let submitGuardUntil = 0;
let selectedGuardUntil = 0;
let appliedFilter = null;
let otherOpen = false;
let notice = null;
let estimate = null;
let review = null;
let pendingDiscard = null;
let lastStoredJson = null;
let storageStatus = null;
let storageMessage = '';
let storageErrorText = '';
let pendingStorage = null;
let restoreGeneration = 0;
let ai = {
  token: 0,
  controller: null,
  timeoutId: null,
  kind: null,
  text: '',
  mode: 'task',
};

function newId() {
  return crypto.randomUUID();
}

function selectedContext(root = form) {
  const checked = root.querySelector('input[name="context"]:checked');
  return CONTEXTS.includes(checked?.value) ? checked.value : 'anywhere';
}

function cloneTask(task) {
  return {
    id: task.id,
    title: task.title,
    minutes: task.minutes,
    context: task.context,
    completed: task.completed === true,
  };
}

function serializeTasks(list) {
  return JSON.stringify({
    version: DATA_VERSION,
    tasks: list.map(cloneTask),
  });
}

function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function resetTaskFields() {
  entryInput.value = '';
  minutesInput.value = '';
  form.querySelector('input[name="context"][value="anywhere"]').checked = true;
  updateEntryCount();
  clearAddErrors();
  clearEstimate();
}

function clearAddErrors() {
  setFieldError(entryInput, entryError, '');
  setFieldError(minutesInput, minutesError, '');
  formError.hidden = true;
  formError.textContent = '';
}

function setFieldError(input, output, message) {
  output.textContent = message;
  output.hidden = !message;
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
}

function validateTitle(raw) {
  const title = raw.trim();
  if (!title) return { error: 'Enter a task title of 1 to 200 characters.' };
  if (title.length > TITLE_MAX) {
    return { error: `Shorten the title to ${TITLE_MAX} characters or fewer. It is currently ${title.length}.` };
  }
  return { value: title };
}

function validateGoal(raw) {
  const goal = raw.trim();
  if (!goal) return { error: 'Enter a goal of 1 to 2,000 characters.' };
  if (goal.length > GOAL_MAX) {
    return { error: `Shorten the goal to ${GOAL_MAX} characters or fewer. It is currently ${goal.length}.` };
  }
  return { value: goal };
}

function validateMinutes(raw) {
  const value = String(raw).trim();
  if (!value) {
    return { error: 'Enter a whole number of minutes from 1 to 1,440.' };
  }
  if (/[.\u00b7]/.test(value) || /e/i.test(value)) {
    return { error: 'Use a whole number of minutes. Fractional estimates are not accepted.' };
  }
  if (!/^-?\d+$/.test(value)) {
    return { error: 'Enter a whole number of minutes. Letters and symbols are not accepted.' };
  }
  const minutes = Number(value);
  if (minutes === 0) return { error: 'Enter at least 1 minute.' };
  if (minutes < 0) return { error: 'Minutes cannot be negative.' };
  if (minutes > MINUTES_MAX) {
    return { error: 'Enter at most 1,440 minutes. Split longer tasks into smaller steps.' };
  }
  return { value: minutes };
}

function validateTask(titleRaw, minutesRaw, contextRaw) {
  const titleResult = validateTitle(titleRaw);
  const minutesResult = validateMinutes(minutesRaw);
  const context = CONTEXTS.includes(contextRaw) ? contextRaw : '';
  const errors = {
    title: titleResult.error || '',
    minutes: minutesResult.error || '',
    context: context ? '' : 'Choose laptop, phone, or anywhere.',
  };
  if (errors.title || errors.minutes || errors.context) return { errors };
  return {
    value: {
      title: titleResult.value,
      minutes: minutesResult.value,
      context,
    },
  };
}

function validateEstimatePayload(data) {
  if (!exactKeys(data, ['minutes']) || !Number.isInteger(data.minutes) || data.minutes < 1 || data.minutes > MINUTES_MAX) {
    return { error: 'Grok returned an unusable reply. No estimate was applied. Try again when you are ready.' };
  }
  return { value: data.minutes };
}

function validateBreakdownPayload(data) {
  const invalid = { error: 'Grok returned an unusable reply. No suggestions were added. Try again when you are ready.' };
  if (!exactKeys(data, ['tasks']) || !Array.isArray(data.tasks) || data.tasks.length < 1 || data.tasks.length > 5) {
    return invalid;
  }
  const rows = [];
  for (const row of data.tasks) {
    if (!exactKeys(row, ['title', 'minutes', 'context']) || typeof row.title !== 'string') return invalid;
    const title = row.title.trim();
    if (!title || title.length > TITLE_MAX || !Number.isInteger(row.minutes) || row.minutes < 1 || row.minutes > MINUTES_MAX || !CONTEXTS.includes(row.context)) {
      return invalid;
    }
    rows.push({
      title,
      minutes: row.minutes,
      context: row.context,
      selected: false,
      original: { title, minutes: row.minutes, context: row.context },
    });
  }
  return { value: rows };
}

function validateStoredTask(row) {
  if (!exactKeys(row, ['id', 'title', 'minutes', 'context', 'completed'])) return null;
  if (typeof row.id !== 'string' || !row.id) return null;
  if (typeof row.title !== 'string' || row.title !== row.title.trim()) return null;
  const title = validateTitle(row.title);
  if (title.error) return null;
  if (!Number.isInteger(row.minutes) || row.minutes < 1 || row.minutes > MINUTES_MAX) return null;
  if (!CONTEXTS.includes(row.context)) return null;
  if (row.completed !== true && row.completed !== false) return null;
  return cloneTask({
    id: row.id,
    title: title.value,
    minutes: row.minutes,
    context: row.context,
    completed: row.completed,
  });
}

function validatePayload(data, asFile = true) {
  const invalid = asFile
    ? 'This file is not a valid Focus planner backup. Nothing was changed.'
    : 'The saved list is invalid. It has not been overwritten.';
  if (!exactKeys(data, ['version', 'tasks'])) return { error: invalid };
  if (!Number.isInteger(data.version) || data.version !== DATA_VERSION) {
    return { error: asFile ? 'This backup uses an unsupported version. Nothing was changed.' : invalid };
  }
  if (!Array.isArray(data.tasks)) return { error: invalid };
  const ids = new Set();
  const list = [];
  for (const row of data.tasks) {
    const task = validateStoredTask(row);
    if (!task) {
      return { error: asFile ? 'This backup has an invalid task record. Nothing was changed.' : invalid };
    }
    if (ids.has(task.id)) {
      return { error: asFile ? 'This backup has duplicate task IDs. Nothing was changed.' : invalid };
    }
    ids.add(task.id);
    list.push(task);
  }
  return { value: { version: DATA_VERSION, tasks: list } };
}

function showStorageError(message) {
  storageErrorText = message;
  storageError.textContent = message;
  storageError.hidden = !message;
}

function renderStorage() {
  const isUnsaved = storageStatus === 'unsaved';
  const isConflict = storageStatus === 'conflict';
  const isRecovery = storageStatus === 'recovery';
  storageBanner.hidden = !storageStatus;
  storageBannerText.textContent = storageMessage;
  retrySaveButton.hidden = !isUnsaved;
  exportCopyButton.hidden = !isConflict;
  reloadSavedButton.hidden = !isConflict;
  recoverRestoreButton.hidden = !isRecovery;
  startEmptyButton.hidden = !isRecovery;

  storageConfirm.hidden = !pendingStorage;
  if (pendingStorage?.type === 'restore') {
    const count = pendingStorage.payload.tasks.length;
    if (count === 0) {
      storageConfirmText.textContent = 'This backup has no tasks. Restoring it will remove all current tasks and any unsaved drafts or review edits.';
    } else {
      storageConfirmText.textContent = `Replace the current list with ${count} ${count === 1 ? 'task' : 'tasks'} from this backup? Current tasks and any unsaved drafts or review edits will be replaced.`;
    }
    storageConfirmYes.textContent = 'Replace';
  } else if (pendingStorage?.type === 'start-empty') {
    storageConfirmText.textContent = 'Start empty and replace the unreadable saved data? Old saved tasks will be replaced.';
    storageConfirmYes.textContent = 'Start empty';
  } else if (pendingStorage?.type === 'reload') {
    storageConfirmText.textContent = 'Reload the list saved by the other tab? This tab’s current tasks and any unsaved drafts or review edits will be discarded.';
    storageConfirmYes.textContent = 'Reload';
  }
  storageError.textContent = storageErrorText;
  storageError.hidden = !storageErrorText;
}

function readStorageRaw() {
  try {
    return { value: window.localStorage.getItem(STORAGE_KEY) };
  } catch {
    return { error: 'unavailable' };
  }
}

function writeStorage(json) {
  try {
    window.localStorage.setItem(STORAGE_KEY, json);
    lastStoredJson = json;
    storageStatus = null;
    storageMessage = '';
    return true;
  } catch {
    return false;
  }
}

function writeIfUnchanged(json, expectedRaw) {
  const current = readStorageRaw();
  if (current.error || current.value !== expectedRaw) return 'stale';
  return writeStorage(json) ? 'ok' : 'failed';
}

function storageSnapshot() {
  const current = readStorageRaw();
  if (current.error) return { unreadable: true, raw: undefined };
  return { unreadable: false, raw: current.value };
}

function bindPendingStorage(type, extra = {}) {
  const snap = storageSnapshot();
  pendingStorage = {
    type,
    expectedRaw: snap.raw,
    ...extra,
  };
}

function refuseStaleReplacement() {
  pendingStorage = null;
  enterConflict();
  showStorageError('The saved list changed in another tab. Replacement did not complete. This tab’s current work is unchanged.');
  renderStorage();
}

function enterUnsaved() {
  storageStatus = 'unsaved';
  storageMessage = 'Changes are not saved. They will not survive closing or refreshing this page.';
}

function enterConflict() {
  storageStatus = 'conflict';
  storageMessage = 'Another tab changed the saved list. This tab will not overwrite it. Export this copy or reload the saved tasks.';
}

function enterRecovery(message) {
  storageStatus = 'recovery';
  storageMessage = message;
}

function storedValueChanged(raw) {
  return raw !== lastStoredJson;
}

function persistTasks() {
  if (storageStatus === 'recovery' || storageStatus === 'conflict') {
    renderStorage();
    return false;
  }
  const current = readStorageRaw();
  if (current.error) {
    enterUnsaved();
    renderStorage();
    return false;
  }
  if (storedValueChanged(current.value)) {
    enterConflict();
    renderStorage();
    return false;
  }
  if (!writeStorage(serializeTasks(tasks))) {
    enterUnsaved();
    renderStorage();
    return false;
  }
  showStorageError('');
  renderStorage();
  return true;
}

function resetWorkspace() {
  abortAi();
  clearEstimate();
  clearReview();
  showAiError('');
  resetTaskFields();
  editingId = null;
  editDraft = null;
  pendingDeleteId = null;
  lastCompletedId = null;
  notice = null;
  undoBanner.hidden = true;
  undoMessage.textContent = '';
  mode = 'task';
  appliedFilter = null;
  otherOpen = false;
  customMinutesInput.value = '';
  setFieldError(customMinutesInput, customMinutesError, '');
  pendingStorage = null;
  completedDetails.open = false;
  syncModeRadios();
}

function applyReplacement(list) {
  tasks.splice(0, tasks.length, ...list.map(cloneTask));
  resetWorkspace();
  storageStatus = null;
  storageMessage = '';
  showStorageError('');
  renderStorage();
  render();
  entryInput.focus();
}

function loadFromStorage() {
  const current = readStorageRaw();
  if (current.error) {
    enterUnsaved();
    return;
  }
  if (current.value === null) {
    lastStoredJson = null;
    return;
  }
  lastStoredJson = current.value;
  let parsed;
  try {
    parsed = JSON.parse(current.value);
  } catch {
    enterRecovery('The saved list could not be read. It has not been overwritten. Restore a valid backup or start empty.');
    return;
  }
  const checked = validatePayload(parsed, false);
  if (checked.error) {
    enterRecovery('The saved list is invalid. It has not been overwritten. Restore a valid backup or start empty.');
    return;
  }
  lastStoredJson = current.value;
  tasks.splice(0, tasks.length, ...checked.value.tasks.map(cloneTask));
}

function exportBackup() {
  try {
    const json = serializeTasks(tasks);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'focus-planner-backup.json';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showStorageError('');
  } catch {
    showStorageError('The backup could not be downloaded. Your list is unchanged.');
  }
  renderStorage();
}

function openRestorePicker() {
  restoreFileInput.value = '';
  restoreFileInput.click();
}

async function onRestoreFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  const token = restoreGeneration + 1;
  restoreGeneration = token;
  pendingStorage = null;
  showStorageError('');
  renderStorage();
  let text;
  try {
    text = await file.text();
  } catch {
    if (token !== restoreGeneration) return;
    pendingStorage = null;
    showStorageError('This file could not be read. Nothing was changed.');
    renderStorage();
    return;
  }
  if (token !== restoreGeneration) return;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    if (token !== restoreGeneration) return;
    pendingStorage = null;
    showStorageError('This file is not valid JSON. Nothing was changed.');
    renderStorage();
    return;
  }
  if (token !== restoreGeneration) return;
  const checked = validatePayload(parsed, true);
  if (token !== restoreGeneration) return;
  if (checked.error) {
    pendingStorage = null;
    showStorageError(checked.error);
    renderStorage();
    return;
  }
  showStorageError('');
  bindPendingStorage('restore', { payload: checked.value });
  renderStorage();
  storageConfirmNo.focus();
}

function requestStartEmpty() {
  bindPendingStorage('start-empty');
  renderStorage();
  storageConfirmNo.focus();
}

function requestReloadSaved() {
  bindPendingStorage('reload');
  renderStorage();
  storageConfirmNo.focus();
}

function cancelPendingStorage() {
  pendingStorage = null;
  renderStorage();
}

function confirmPendingStorage() {
  const pending = pendingStorage;
  pendingStorage = null;
  if (!pending) return;

  if (pending.type === 'restore') {
    const written = writeIfUnchanged(serializeTasks(pending.payload.tasks), pending.expectedRaw);
    if (written === 'stale') {
      refuseStaleReplacement();
      return;
    }
    if (written === 'failed') {
      showStorageError('Restore did not complete. Your current list and drafts are unchanged.');
      renderStorage();
      return;
    }
    applyReplacement(pending.payload.tasks);
    return;
  }

  if (pending.type === 'start-empty') {
    const written = writeIfUnchanged(serializeTasks([]), pending.expectedRaw);
    if (written === 'stale') {
      refuseStaleReplacement();
      return;
    }
    if (written === 'failed') {
      enterRecovery('The saved list is invalid. It has not been overwritten. Restore a valid backup or start empty.');
      showStorageError('The empty list could not be saved. The recovery state is unchanged.');
      renderStorage();
      return;
    }
    applyReplacement([]);
    return;
  }

  if (pending.type === 'reload') {
    const current = readStorageRaw();
    if (current.error || current.value === null) {
      showStorageError('The other tab’s saved list could not be read. This tab’s work is unchanged.');
      renderStorage();
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(current.value);
    } catch {
      enterRecovery('The saved list could not be read. It has not been overwritten. Restore a valid backup or start empty.');
      renderStorage();
      return;
    }
    const checked = validatePayload(parsed, false);
    if (checked.error) {
      enterRecovery(checked.error);
      renderStorage();
      return;
    }
    lastStoredJson = current.value;
    applyReplacement(checked.value.tasks);
  }
}

function taskFits(task) {
  return appliedFilter === null || task.minutes <= appliedFilter;
}

function unfinishedTasks() {
  return tasks.filter((task) => !task.completed);
}

function completedTasks() {
  return tasks.filter((task) => task.completed);
}

function visibleUnfinished() {
  return unfinishedTasks().filter((task) => (
    taskFits(task) || task.id === editingId || task.id === pendingDeleteId
  ));
}

function clearUndo() {
  lastCompletedId = null;
  undoBanner.hidden = true;
  undoMessage.textContent = '';
}

function showUndo(task) {
  lastCompletedId = task.id;
  undoMessage.textContent = `“${task.title}” marked complete.`;
  undoBanner.hidden = false;
}

function clearNotice() {
  notice = null;
}

function showNotice(kind, task) {
  notice = { kind, title: task.title };
}

function applyAllTimes() {
  appliedFilter = null;
  otherOpen = false;
  customMinutesInput.value = '';
  setFieldError(customMinutesInput, customMinutesError, '');
  clearNotice();
  render();
}

function applyPreset(minutes) {
  appliedFilter = minutes;
  otherOpen = false;
  setFieldError(customMinutesInput, customMinutesError, '');
  clearNotice();
  render();
}

function applyCustom(event) {
  event.preventDefault();
  const result = validateMinutes(customMinutesInput.value);
  if (result.error) {
    setFieldError(customMinutesInput, customMinutesError, result.error);
    customMinutesInput.focus();
    return;
  }
  appliedFilter = result.value;
  setFieldError(customMinutesInput, customMinutesError, '');
  clearNotice();
  render();
}

function taskById(id) {
  return tasks.find((task) => task.id === id);
}

function contextLabel(context) {
  return context[0].toUpperCase() + context.slice(1);
}

function minutesLabel(minutes) {
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function updateEntryCount() {
  const limit = mode === 'goal' ? GOAL_MAX : TITLE_MAX;
  entryCount.textContent = String(entryInput.value.trim().length);
  entryLimit.textContent = limit === GOAL_MAX ? '2,000' : '200';
}

function reviewDirty() {
  return Boolean(review?.rows.some((row) => (
    row.selected
    || row.title !== row.original.title
    || String(row.minutes).trim() !== String(row.original.minutes)
    || row.context !== row.original.context
  )));
}

function selectedRows() {
  return review ? review.rows.filter((row) => row.selected) : [];
}

function clearEstimate() {
  estimate = null;
  estimateProposal.hidden = true;
  estimateProposalText.textContent = '';
}

function clearReview() {
  review = null;
  pendingDiscard = null;
  reviewSection.hidden = true;
  discardBanner.hidden = true;
  reviewError.hidden = true;
  reviewError.textContent = '';
  suggestionList.replaceChildren();
  entryInput.readOnly = false;
}

function showAiError(message) {
  aiError.textContent = message;
  aiError.hidden = !message;
}

function stopAiWait() {
  if (ai.timeoutId) window.clearTimeout(ai.timeoutId);
  if (ai.controller) ai.controller.abort();
  ai.timeoutId = null;
  ai.controller = null;
  ai.kind = null;
  ai.text = '';
  aiWaiting.hidden = true;
  syncModeUi();
}

function abortAi() {
  ai.token += 1;
  stopAiWait();
}

function requestStillCurrent(token) {
  return token === ai.token
    && mode === ai.mode
    && entryInput.value.trim() === ai.text;
}

const AI_ERROR_MESSAGES = {
  AI_NOT_CONFIGURED: 'Add your key to .env, save, and restart the server. Manual tasks still work.',
  AI_AUTH_ERROR: 'The API key was not accepted. Check .env and restart the server. Manual tasks still work.',
  AI_ACCESS_ERROR: 'This account cannot use the requested AI service. Manual tasks still work.',
  AI_MODEL_UNAVAILABLE: 'The selected Grok model is unavailable for this account. Manual tasks still work.',
  AI_CREDITS_EXHAUSTED: 'AI credits are exhausted. Your tasks are unchanged. Manual tasks still work.',
  AI_TIMEOUT: 'Grok took too long. Nothing was added. Try again when you are ready.',
  AI_REFUSED: 'Grok could not help with that request. Try a different fictional example.',
  AI_INVALID_RESPONSE: 'Grok returned an unusable reply. Nothing was added. Try again when you are ready.',
  AI_BUSY: 'One AI request is already running. Wait for it or cancel it.',
  AI_RATE_LIMITED: 'The AI service is receiving too many requests. Wait, then try again.',
  AI_UNAVAILABLE: 'The AI service is unavailable. Your tasks are unchanged. Try again later.',
  INVALID_INPUT: 'Enter a valid task or goal within the displayed length limit.',
  INPUT_TOO_LARGE: 'This request is too large. Shorten your input.',
  UNSUPPORTED_TYPE: 'This request could not be sent. Try again from the app.',
  ORIGIN_DENIED: 'Open the workshop using the exact local link in the terminal.',
};

function messageForStatus(status, payload) {
  const code = payload?.error?.code;
  if (code && AI_ERROR_MESSAGES[code]) return AI_ERROR_MESSAGES[code];
  if (status === 429) return AI_ERROR_MESSAGES.AI_RATE_LIMITED;
  if (status === 400) return AI_ERROR_MESSAGES.INVALID_INPUT;
  return AI_ERROR_MESSAGES.AI_UNAVAILABLE;
}

async function startAi(kind) {
  const parsed = kind === 'estimate' ? validateTitle(entryInput.value) : validateGoal(entryInput.value);
  if (parsed.error) {
    setFieldError(entryInput, entryError, parsed.error);
    entryInput.focus();
    return;
  }
  if (ai.controller) abortAi();
  showAiError('');
  clearAddErrors();
  if (kind === 'estimate') clearEstimate();
  const token = ai.token + 1;
  const controller = new AbortController();
  ai.token = token;
  ai.controller = controller;
  ai.kind = kind;
  ai.mode = mode;
  ai.text = parsed.value;
  aiWaitingText.textContent = kind === 'estimate' ? 'Estimating with Grok…' : 'Breaking the goal into tasks…';
  aiWaiting.hidden = false;
  syncModeUi();
  ai.timeoutId = window.setTimeout(() => {
    if (token !== ai.token) return;
    controller.abort();
    stopAiWait();
    showAiError('Grok took too long. Nothing was added. Try again when you are ready.');
  }, AI_TIMEOUT_MS);

  try {
    const response = await fetch(kind === 'estimate' ? '/api/estimate' : '/api/breakdown', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(kind === 'estimate' ? { task: parsed.value } : { goal: parsed.value }),
      signal: controller.signal,
    });
    if (!requestStillCurrent(token)) return;
    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }
    if (!requestStillCurrent(token)) return;
    if (!response.ok) {
      stopAiWait();
      showAiError(messageForStatus(response.status, payload));
      return;
    }
    if (kind === 'estimate') {
      const checked = validateEstimatePayload(payload);
      stopAiWait();
      if (checked.error) {
        showAiError(checked.error);
        return;
      }
      estimate = { minutes: checked.value, forText: parsed.value };
      estimateProposalText.textContent = `Grok suggests ${minutesLabel(checked.value)}. This is a rough proposal and has not been saved.`;
      estimateProposal.hidden = false;
      acceptEstimate.focus();
      return;
    }
    const checked = validateBreakdownPayload(payload);
    stopAiWait();
    if (checked.error) {
      showAiError(checked.error);
      return;
    }
    review = { goal: parsed.value, rows: checked.value };
    entryInput.readOnly = true;
    renderReview();
    document.querySelector('#select-all')?.focus();
  } catch (error) {
    if (token !== ai.token) return;
    if (error?.name === 'AbortError') {
      if (ai.timeoutId) return;
      stopAiWait();
      return;
    }
    stopAiWait();
    showAiError('The network request failed. Your tasks are unchanged. Try again when you are ready.');
  }
}

function syncModeRadios() {
  const selected = form.querySelector(`input[name="mode"][value="${mode}"]`);
  if (selected) selected.checked = true;
}

function syncModeUi() {
  const waiting = Boolean(ai.controller);
  const isTask = mode === 'task';
  syncModeRadios();
  formHeading.textContent = isTask ? 'Add a task' : 'Break down a goal';
  entryLabel.textContent = isTask ? 'Task' : 'Goal';
  aiExample.textContent = isTask ? 'Buy milk' : 'Organize a picnic for six friends';
  taskOnly.hidden = !isTask;
  addButton.hidden = !isTask;
  estimateButton.hidden = !isTask;
  breakdownButton.hidden = isTask;
  estimateButton.disabled = waiting;
  breakdownButton.disabled = waiting;
  entryInput.readOnly = Boolean(review);
  updateEntryCount();
  if (!estimate || estimate.forText !== entryInput.value.trim()) {
    if (estimate && estimate.forText !== entryInput.value.trim()) clearEstimate();
  }
}

function applyMode(next) {
  if (mode === next) return;
  abortAi();
  clearEstimate();
  clearReview();
  showAiError('');
  mode = next;
  form.querySelector(`input[name="mode"][value="${next}"]`).checked = true;
  syncModeUi();
  render();
  entryInput.focus();
}

function requestMode(next) {
  if (next === mode) {
    syncModeRadios();
    return;
  }
  if (review && reviewDirty()) {
    pendingDiscard = { type: 'switch', next };
    syncModeRadios();
    renderDiscard();
    return;
  }
  applyMode(next);
}

function renderDiscard() {
  discardBanner.hidden = !pendingDiscard;
  if (pendingDiscard) discardCancel.focus();
}

function confirmDiscard() {
  const pending = pendingDiscard;
  pendingDiscard = null;
  if (!pending) return;
  if (pending.type === 'switch') {
    applyMode(pending.next);
    return;
  }
  if (pending.type === 'edit-goal') {
    clearReview();
    syncModeUi();
    entryInput.focus();
    return;
  }
  if (pending.type === 'try-again') {
    clearReview();
    syncModeUi();
    startAi('breakdown');
    return;
  }
  if (pending.type === 'cancel-review') {
    clearReview();
    syncModeUi();
    entryInput.focus();
  }
}

function cancelPendingDiscard() {
  pendingDiscard = null;
  syncModeRadios();
  renderDiscard();
}

function requestDiscard(type) {
  if (review && reviewDirty()) {
    pendingDiscard = { type };
    syncModeRadios();
    renderDiscard();
    return;
  }
  pendingDiscard = { type };
  confirmDiscard();
}

function requestBreakdown() {
  if (review) {
    requestDiscard('try-again');
    return;
  }
  startAi('breakdown');
}

function renderReview() {
  reviewSection.hidden = !review;
  if (!review) return;
  reviewGoal.textContent = `Original goal: ${review.goal}`;
  renderDiscard();
  suggestionList.replaceChildren(...review.rows.map((row, index) => {
    const item = document.createElement('li');
    item.className = 'task-row';
    item.dataset.index = String(index);
    item.innerHTML = `
      <label class="suggestion-include">
        <input type="checkbox" data-field="selected" ${row.selected ? 'checked' : ''}>
        <span>Include this step</span>
      </label>
      <div class="edit-fields">
        <div class="field">
          <label for="suggest-title-${index}">Task</label>
          <input id="suggest-title-${index}" data-field="title" type="text" value="${escapeHtml(row.title)}" autocomplete="off">
        </div>
        <div class="field">
          <label for="suggest-minutes-${index}">Estimated minutes</label>
          <input id="suggest-minutes-${index}" data-field="minutes" type="text" inputmode="numeric" value="${escapeHtml(String(row.minutes))}" autocomplete="off">
        </div>
      </div>
      <fieldset class="context-fieldset">
        <legend>Context</legend>
        <div class="context-options">
          ${CONTEXTS.map((context) => `
            <label class="choice">
              <input type="radio" name="suggest-context-${index}" data-field="context" value="${context}" ${row.context === context ? 'checked' : ''}>
              <span>${escapeHtml(contextLabel(context))}</span>
            </label>
          `).join('')}
        </div>
      </fieldset>
      <p class="error row-error" data-row-error hidden></p>
    `;
    return item;
  }));
  updateSelectedButton();
}

function updateSelectedButton() {
  const count = selectedRows().length;
  addSelectedButton.textContent = `Add selected tasks (${count})`;
  addSelectedButton.disabled = count === 0 || Date.now() < selectedGuardUntil;
}

function readSuggestionRow(item, index) {
  const row = review.rows[index];
  row.title = item.querySelector('[data-field="title"]').value;
  row.minutes = item.querySelector('[data-field="minutes"]').value;
  row.context = item.querySelector('[data-field="context"]:checked')?.value || row.context;
  row.selected = item.querySelector('[data-field="selected"]').checked;
}

function addSelectedTasks() {
  if (!review || Date.now() < selectedGuardUntil) return;
  reviewError.hidden = true;
  reviewError.textContent = '';
  for (const item of suggestionList.querySelectorAll('[data-index]')) {
    readSuggestionRow(item, Number(item.dataset.index));
    const error = item.querySelector('[data-row-error]');
    error.hidden = true;
    error.textContent = '';
  }
  const chosen = [];
  for (const [index, row] of review.rows.entries()) {
    if (!row.selected) continue;
    const result = validateTask(row.title, row.minutes, row.context);
    const item = suggestionList.querySelector(`[data-index="${index}"]`);
    if (result.errors) {
      const message = [result.errors.title, result.errors.minutes, result.errors.context].filter(Boolean).join(' ');
      const error = item.querySelector('[data-row-error]');
      error.textContent = message;
      error.hidden = false;
      reviewError.textContent = 'Fix the highlighted selected step before adding. Unselected steps are ignored.';
      reviewError.hidden = false;
      const field = result.errors.title ? item.querySelector('[data-field="title"]') : item.querySelector('[data-field="minutes"]');
      field?.focus();
      return;
    }
    chosen.push(result.value);
  }
  if (!chosen.length) {
    addSelectedButton.disabled = true;
    return;
  }

  selectedGuardUntil = Date.now() + SUBMIT_GUARD_MS;
  addSelectedButton.disabled = true;
  window.setTimeout(() => {
    selectedGuardUntil = 0;
    updateSelectedButton();
  }, SUBMIT_GUARD_MS);

  abortAi();
  clearUndo();
  const added = chosen.map((value) => ({
    id: newId(),
    title: value.title,
    minutes: value.minutes,
    context: value.context,
    completed: false,
  }));
  tasks.push(...added);
  const unfit = added.filter((task) => !taskFits(task));
  if (unfit.length === 1) showNotice('saved', unfit[0]);
  else if (unfit.length > 1) showNotice('saved', { title: `${unfit.length} selected tasks` });
  else clearNotice();
  entryInput.value = '';
  updateEntryCount();
  clearReview();
  updateSelectedButton();
  syncModeUi();
  persistTasks();
  render();
  entryInput.focus();
}

function renderFilter() {
  for (const button of filterButtons) {
    const minutes = Number(button.dataset.preset);
    button.setAttribute('aria-pressed', !otherOpen && appliedFilter === minutes ? 'true' : 'false');
  }
  otherFilterButton.setAttribute('aria-expanded', otherOpen ? 'true' : 'false');
  otherFilterButton.setAttribute('aria-pressed', otherOpen ? 'true' : 'false');
  allTimesButton.setAttribute('aria-pressed', !otherOpen && appliedFilter === null ? 'true' : 'false');
  customFilterForm.hidden = !otherOpen;

  if (appliedFilter === null) {
    activeTime.textContent = 'Showing all times.';
  } else {
    activeTime.textContent = `Showing tasks of ${minutesLabel(appliedFilter)} or less. These are rough estimates, not a combined schedule.`;
  }

  const unfinished = unfinishedTasks();
  const visible = visibleUnfinished().filter((task) => taskFits(task));
  filterGuidance.hidden = appliedFilter === null || visible.length === 0;

  if (!notice) {
    filterNotice.hidden = true;
    filterNoticeText.textContent = '';
  } else if (notice.kind === 'saved') {
    filterNotice.hidden = false;
    filterNoticeText.textContent = `“${notice.title}” was saved. It does not fit this time.`;
    filterNoticeButton.textContent = 'Show all tasks';
  } else {
    filterNotice.hidden = false;
    filterNoticeText.textContent = `“${notice.title}” was reopened. It does not fit this time.`;
    filterNoticeButton.textContent = 'All times';
  }

  if (tasks.length === 0) {
    unfinishedEmpty.hidden = false;
    unfinishedEmptyText.textContent = 'No tasks yet. Add one above.';
    emptyAllTimesButton.hidden = true;
  } else if (unfinished.length === 0) {
    unfinishedEmpty.hidden = false;
    unfinishedEmptyText.textContent = 'All tasks are completed.';
    emptyAllTimesButton.hidden = true;
  } else if (visible.length === 0) {
    unfinishedEmpty.hidden = false;
    unfinishedEmptyText.textContent = 'No unfinished tasks fit this time. Choose All times or a longer time.';
    emptyAllTimesButton.hidden = false;
  } else {
    unfinishedEmpty.hidden = true;
    emptyAllTimesButton.hidden = true;
  }
}

function render() {
  const completed = completedTasks();
  syncModeUi();
  renderFilter();
  unfinishedList.replaceChildren(...visibleUnfinished().map((task) => renderRow(task, false)));
  completedSection.hidden = completed.length === 0;
  completedCount.textContent = `(${completed.length})`;
  completedList.replaceChildren(...completed.map((task) => renderRow(task, true)));
}

function renderRow(task, isCompleted) {
  const item = document.createElement('li');
  item.className = 'task-row';
  item.dataset.id = task.id;

  if (pendingDeleteId === task.id) {
    item.append(renderDeleteConfirm(task));
    return item;
  }

  if (!isCompleted && editingId === task.id) {
    item.append(renderEditForm(task));
    return item;
  }

  const copy = document.createElement('div');
  copy.className = 'task-copy';
  copy.innerHTML = `
    <p class="task-title">${escapeHtml(task.title)}</p>
    <p class="task-meta">${escapeHtml(minutesLabel(task.minutes))} · ${escapeHtml(contextLabel(task.context))}</p>
  `;
  item.append(copy);

  const actions = document.createElement('div');
  actions.className = 'task-actions';

  if (isCompleted) {
    const reopen = document.createElement('button');
    reopen.type = 'button';
    reopen.className = 'secondary';
    reopen.dataset.action = 'reopen';
    reopen.textContent = 'Mark incomplete';
    actions.append(reopen);
  } else {
    const complete = document.createElement('button');
    complete.type = 'button';
    complete.className = 'secondary';
    complete.dataset.action = 'complete';
    complete.textContent = 'Mark complete';

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'secondary';
    edit.dataset.action = 'edit';
    edit.textContent = 'Edit';

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'danger';
    remove.dataset.action = 'delete';
    remove.textContent = 'Delete';

    actions.append(complete, edit, remove);
  }

  item.append(actions);
  return item;
}

function renderDeleteConfirm(task) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <p class="task-title">Delete “${escapeHtml(task.title)}”?</p>
    <p class="hint">This removes only this task. Cancel keeps it.</p>
    <div class="confirm-actions">
      <button type="button" class="danger" data-action="confirm-delete">Delete task</button>
      <button type="button" class="secondary" data-action="cancel-delete">Cancel</button>
    </div>
  `;
  return wrap;
}

function renderEditForm(task) {
  const draft = editDraft ?? { title: task.title, minutes: String(task.minutes), context: task.context };
  const wrap = document.createElement('form');
  wrap.className = 'edit-form';
  wrap.noValidate = true;
  wrap.innerHTML = `
    <div class="edit-fields">
      <div class="field">
        <label for="edit-title-${task.id}">Task</label>
        <input id="edit-title-${task.id}" name="title" type="text" value="${escapeHtml(draft.title)}" autocomplete="off">
      </div>
      <div class="field">
        <label for="edit-minutes-${task.id}">Estimated minutes</label>
        <input id="edit-minutes-${task.id}" name="minutes" type="text" inputmode="numeric" value="${escapeHtml(draft.minutes)}" autocomplete="off">
      </div>
    </div>
    <fieldset class="context-fieldset">
      <legend>Context</legend>
      <div class="context-options">
        ${CONTEXTS.map((context) => `
          <label class="choice">
            <input type="radio" name="context" value="${context}" ${draft.context === context ? 'checked' : ''}>
            <span>${escapeHtml(contextLabel(context))}</span>
          </label>
        `).join('')}
      </div>
    </fieldset>
    <p class="error row-error" data-edit-error hidden></p>
    <div class="task-actions">
      <button type="submit" class="primary" data-action="save">Save</button>
      <button type="button" class="secondary" data-action="cancel-edit">Cancel</button>
    </div>
  `;
  return wrap;
}

function beginEdit(task) {
  editingId = task.id;
  pendingDeleteId = null;
  editDraft = { title: task.title, minutes: String(task.minutes), context: task.context };
  render();
  document.querySelector(`#edit-title-${task.id}`)?.focus();
}

function cancelEdit() {
  const id = editingId;
  editingId = null;
  editDraft = null;
  render();
  const editButton = document.querySelector(`[data-id="${id}"] [data-action="edit"]`);
  (editButton ?? allTimesButton).focus();
}

function saveEdit(row) {
  const titleRaw = row.querySelector('[name="title"]').value;
  const minutesRaw = row.querySelector('[name="minutes"]').value;
  const result = validateTask(titleRaw, minutesRaw, selectedContext(row));
  const error = row.querySelector('[data-edit-error]');
  if (result.errors) {
    editDraft = { title: titleRaw, minutes: minutesRaw, context: selectedContext(row) };
    error.textContent = [result.errors.title, result.errors.minutes, result.errors.context].filter(Boolean).join(' ');
    error.hidden = false;
    const invalid = result.errors.title
      ? row.querySelector('[name="title"]')
      : row.querySelector('[name="minutes"]');
    invalid?.focus();
    return;
  }

  const task = taskById(editingId);
  task.title = result.value.title;
  task.minutes = result.value.minutes;
  task.context = result.value.context;
  editingId = null;
  editDraft = null;
  clearUndo();
  persistTasks();
  if (!taskFits(task)) {
    showNotice('saved', task);
    render();
    filterNoticeButton.focus();
    return;
  }
  clearNotice();
  render();
  document.querySelector(`[data-id="${task.id}"] [data-action="edit"]`)?.focus();
}

function addTask(event) {
  event.preventDefault();
  if (mode !== 'task') return;
  if (Date.now() < submitGuardUntil) return;

  const result = validateTask(entryInput.value, minutesInput.value, selectedContext());
  if (result.errors) {
    setFieldError(entryInput, entryError, result.errors.title);
    setFieldError(minutesInput, minutesError, result.errors.minutes);
    formError.textContent = result.errors.context;
    formError.hidden = !result.errors.context;
    (result.errors.title ? entryInput : minutesInput).focus();
    return;
  }

  abortAi();
  submitGuardUntil = Date.now() + SUBMIT_GUARD_MS;
  addButton.disabled = true;
  window.setTimeout(() => {
    addButton.disabled = false;
    submitGuardUntil = 0;
  }, SUBMIT_GUARD_MS);

  const task = {
    id: newId(),
    title: result.value.title,
    minutes: result.value.minutes,
    context: result.value.context,
    completed: false,
  };
  tasks.push(task);
  editingId = null;
  editDraft = null;
  pendingDeleteId = null;
  clearUndo();
  if (!taskFits(task)) showNotice('saved', task);
  else clearNotice();
  resetTaskFields();
  persistTasks();
  render();
  entryInput.focus();
}

function completeTask(id) {
  const task = taskById(id);
  if (!task || task.completed) return;
  task.completed = true;
  if (editingId === id) {
    editingId = null;
    editDraft = null;
  }
  pendingDeleteId = null;
  clearNotice();
  showUndo(task);
  persistTasks();
  render();
  undoButton.focus();
}

function restoreIncomplete(task) {
  task.completed = false;
  pendingDeleteId = null;
  clearUndo();
  persistTasks();
  if (!taskFits(task)) {
    showNotice('reopened', task);
    render();
    filterNoticeButton.focus();
    return;
  }
  clearNotice();
  render();
  const completeButton = document.querySelector(`[data-id="${task.id}"] [data-action="complete"]`);
  (completeButton ?? allTimesButton).focus();
}

function reopenTask(id) {
  const task = taskById(id);
  if (!task || !task.completed) return;
  restoreIncomplete(task);
}

function undoCompletion() {
  if (!lastCompletedId) return;
  const task = taskById(lastCompletedId);
  if (!task) {
    clearUndo();
    render();
    return;
  }
  restoreIncomplete(task);
}

function requestDelete(id) {
  pendingDeleteId = id;
  if (editingId === id) {
    editingId = null;
    editDraft = null;
  }
  render();
  document.querySelector(`[data-id="${id}"] [data-action="confirm-delete"]`)?.focus();
}

function cancelDelete() {
  const id = pendingDeleteId;
  pendingDeleteId = null;
  render();
  const deleteButton = document.querySelector(`[data-id="${id}"] [data-action="delete"]`);
  (deleteButton ?? allTimesButton).focus();
}

function confirmDelete() {
  const id = pendingDeleteId;
  const index = tasks.findIndex((task) => task.id === id);
  if (index === -1) return;
  tasks.splice(index, 1);
  pendingDeleteId = null;
  if (editingId === id) {
    editingId = null;
    editDraft = null;
  }
  clearUndo();
  clearNotice();
  persistTasks();
  render();
  entryInput.focus();
}

function onListClick(event) {
  const button = event.target.closest('button');
  if (!button) return;
  const row = button.closest('[data-id]');
  const id = row?.dataset.id;
  const action = button.dataset.action;
  if (!id || !action) return;

  if (action === 'complete') completeTask(id);
  if (action === 'reopen') reopenTask(id);
  if (action === 'edit') beginEdit(taskById(id));
  if (action === 'delete') requestDelete(id);
  if (action === 'cancel-delete') cancelDelete();
  if (action === 'confirm-delete') confirmDelete();
  if (action === 'cancel-edit') cancelEdit();
}

function onListSubmit(event) {
  const editForm = event.target.closest('.edit-form');
  if (!editForm) return;
  event.preventDefault();
  saveEdit(editForm);
}

function onEntryInput() {
  updateEntryCount();
  if (entryError.textContent) setFieldError(entryInput, entryError, '');
  if (estimate && estimate.forText !== entryInput.value.trim()) clearEstimate();
  if (ai.controller && entryInput.value.trim() !== ai.text) abortAi();
}

form.querySelectorAll('input[name="mode"]').forEach((input) => {
  input.addEventListener('change', () => requestMode(input.value));
});

entryInput.addEventListener('input', onEntryInput);
minutesInput.addEventListener('input', () => {
  if (minutesError.textContent) setFieldError(minutesInput, minutesError, '');
});
customMinutesInput.addEventListener('input', () => {
  if (customMinutesError.textContent) setFieldError(customMinutesInput, customMinutesError, '');
});

form.addEventListener('submit', addTask);
estimateButton.addEventListener('click', () => startAi('estimate'));
breakdownButton.addEventListener('click', requestBreakdown);
aiCancel.addEventListener('click', () => {
  abortAi();
  showAiError('The request was cancelled. Nothing was added.');
});
acceptEstimate.addEventListener('click', () => {
  if (!estimate) return;
  minutesInput.value = String(estimate.minutes);
  setFieldError(minutesInput, minutesError, '');
  minutesInput.focus();
});
document.querySelector('#select-all').addEventListener('click', () => {
  if (!review) return;
  for (const row of review.rows) row.selected = true;
  renderReview();
});
document.querySelector('#deselect-all').addEventListener('click', () => {
  if (!review) return;
  for (const row of review.rows) row.selected = false;
  renderReview();
});
addSelectedButton.addEventListener('click', addSelectedTasks);
document.querySelector('#edit-goal').addEventListener('click', () => requestDiscard('edit-goal'));
document.querySelector('#try-again').addEventListener('click', () => requestDiscard('try-again'));
document.querySelector('#cancel-review').addEventListener('click', () => requestDiscard('cancel-review'));
discardConfirm.addEventListener('click', confirmDiscard);
discardCancel.addEventListener('click', cancelPendingDiscard);
suggestionList.addEventListener('input', (event) => {
  const item = event.target.closest('[data-index]');
  if (!item || !review) return;
  readSuggestionRow(item, Number(item.dataset.index));
  updateSelectedButton();
});
suggestionList.addEventListener('change', (event) => {
  const item = event.target.closest('[data-index]');
  if (!item || !review) return;
  readSuggestionRow(item, Number(item.dataset.index));
  updateSelectedButton();
});

customFilterForm.addEventListener('submit', applyCustom);
unfinishedList.addEventListener('click', onListClick);
unfinishedList.addEventListener('submit', onListSubmit);
completedList.addEventListener('click', onListClick);
undoButton.addEventListener('click', undoCompletion);
allTimesButton.addEventListener('click', applyAllTimes);
emptyAllTimesButton.addEventListener('click', applyAllTimes);
filterNoticeButton.addEventListener('click', applyAllTimes);
otherFilterButton.addEventListener('click', () => {
  otherOpen = true;
  render();
  customMinutesInput.focus();
});

for (const button of filterButtons) {
  button.addEventListener('click', () => applyPreset(Number(button.dataset.preset)));
}

retrySaveButton.addEventListener('click', () => {
  persistTasks();
  render();
});
exportCopyButton.addEventListener('click', exportBackup);
exportBackupButton.addEventListener('click', exportBackup);
restoreBackupButton.addEventListener('click', openRestorePicker);
recoverRestoreButton.addEventListener('click', openRestorePicker);
restoreFileInput.addEventListener('change', onRestoreFile);
startEmptyButton.addEventListener('click', requestStartEmpty);
reloadSavedButton.addEventListener('click', requestReloadSaved);
storageConfirmYes.addEventListener('click', confirmPendingStorage);
storageConfirmNo.addEventListener('click', cancelPendingStorage);
window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY) return;
  if (event.newValue === lastStoredJson) return;
  enterConflict();
  renderStorage();
});

resetTaskFields();
loadFromStorage();
syncModeUi();
renderStorage();
render();
entryInput.focus();
