// ================================================================
//  Филворд «Ценности большой страны»
//  Два способа набора буквы, пишущие в один и тот же selectedPath:
//   1) Тап пальцем/кликом по букве — превью увеличенной буквы над
//      пальцем (как iOS-клавиатура), добавление происходит при отпускании.
//   2) Джойстик (стрелки + ОК) — свободное перемещение курсора по полю,
//      ОК пытается добавить букву под курсором.
//  Оба способа подчиняются одному правилу: новая буква должна быть
//  первой в слове или соседней (вправо/вниз) от последней выбранной.
// ================================================================

// ---------- Хранилище (localStorage) ----------
const STORAGE_KEY = 'filword_values_history_v1';

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveGameResult(entry) {
  try {
    const history = loadHistory();
    history.unshift(entry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (e) {
    console.error('Не удалось сохранить результат:', e);
  }
}

function getBestTime() {
  const history = loadHistory();
  const completed = history.filter(h => h.completed);
  if (!completed.length) return null;
  return completed.reduce((best, h) => (h.seconds < best.seconds ? h : best));
}

// ---------- Формат времени ----------
function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function formatDate(iso) {
  const d = new Date(iso);
  const dd = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const tt = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `${dd}, ${tt}`;
}

function capitalize(w) {
  return w.charAt(0) + w.slice(1).toLowerCase();
}

// ---------- Навигация между экранами ----------
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById('screen-' + name);
  if (target) target.classList.add('active');
  if (name === 'history') renderHistory();
  if (name === 'menu') renderBestTimeNote();
  window.scrollTo(0, 0);
}

function renderBestTimeNote() {
  const note = document.getElementById('best-time-note');
  const best = getBestTime();
  if (best) {
    note.hidden = false;
    note.textContent = 'Ваш рекорд: ' + formatTime(best.seconds);
  } else {
    note.hidden = true;
  }
}

function renderHistory() {
  const container = document.getElementById('history-list');
  const history = loadHistory();

  if (!history.length) {
    container.innerHTML =
      '<div class="empty-state">' +
      '<p class="empty-title">Пока нет сыгранных партий</p>' +
      '<p class="empty-sub">Начните игру в главном меню — и первая запись появится здесь.</p>' +
      '</div>';
    return;
  }

  const best = getBestTime();

  const rows = history.map(h => {
    const isBest = best && h.completed && h.seconds === best.seconds && h.date === best.date;
    return (
      '<div class="history-row ' + (h.completed ? '' : 'history-row-incomplete') + '">' +
        '<div class="history-main">' +
          '<span class="history-date">' + formatDate(h.date) + '</span>' +
          '<span class="history-badge ' + (h.completed ? 'badge-done' : 'badge-partial') + '">' +
            (h.completed ? 'Пройдено' : 'Не завершено') +
          '</span>' +
          (isBest ? '<span class="history-badge badge-record">Рекорд</span>' : '') +
        '</div>' +
        '<div class="history-side">' +
          '<span class="history-num">' + h.found + '<span class="history-num-sub">/17</span></span>' +
          '<span class="history-time">' + formatTime(h.seconds) + '</span>' +
        '</div>' +
      '</div>'
    );
  }).join('');

  container.innerHTML = '<div class="history-rows">' + rows + '</div>';
}

function renderValues() {
  const list = document.getElementById('value-list');
  list.innerHTML = VALUES_DATA.map(v =>
    '<div class="value-item">' +
      '<h3 class="value-word">' + v.word + '</h3>' +
      '<p class="value-text">' + v.text + '</p>' +
    '</div>'
  ).join('');
}

// ================================================================
//                         ИГРОВОЙ ДВИЖОК
// ================================================================

const N = GRID_DATA.size;
const gridLetters = GRID_DATA.grid.map(row => row.split(''));

const wordPaths = new Map();
GRID_DATA.words.forEach(w => wordPaths.set(w.word, w.path));

let foundWords = new Set();
let timerInterval = null;
let secondsElapsed = 0;
let gameActive = false;
let cellEls = [];

// Текущий набор букв слова (общий для тапа и джойстика)
let selectedPath = [];

// Позиция курсора джойстика (свободно двигается по полю)
let cursorPos = [0, 0];

// ---------- Построение поля ----------
function buildBoard() {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';
  boardEl.style.setProperty('--n', N);
  cellEls = [];
  for (let r = 0; r < N; r++) {
    const row = [];
    for (let c = 0; c < N; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.textContent = gridLetters[r][c];
      cell.dataset.r = r;
      cell.dataset.c = c;
      boardEl.appendChild(cell);
      row.push(cell);
    }
    cellEls.push(row);
  }
}

function buildWordList() {
  const wordListEl = document.getElementById('word-list');
  wordListEl.innerHTML = '';
  const sorted = GRID_DATA.words.map(w => w.word).sort((a, b) => a.localeCompare(b, 'ru'));
  sorted.forEach(word => {
    const chip = document.createElement('span');
    chip.className = 'word-chip';
    chip.textContent = word;
    chip.dataset.word = word;
    wordListEl.appendChild(chip);
  });
}

// ---------- Таймер ----------
function startTimer() {
  stopTimer();
  secondsElapsed = 0;
  document.getElementById('timer').textContent = formatTime(0);
  timerInterval = setInterval(() => {
    secondsElapsed++;
    document.getElementById('timer').textContent = formatTime(secondsElapsed);
  }, 1000);
}

function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
}

// ---------- Запуск новой игры ----------
function startGame() {
  foundWords = new Set();
  gameActive = true;
  buildBoard();
  buildWordList();
  updateProgress();
  startTimer();
  resetSelection();
  cursorPos = [0, 0];
  updateCursorHighlight();
  document.getElementById('win-overlay').classList.remove('visible');
  showScreen('game');
}

function updateProgress() {
  document.getElementById('found-count').textContent = foundWords.size;
  document.getElementById('progress-fill').style.width =
    (foundWords.size / GRID_DATA.words.length) * 100 + '%';
}

// ---------- Общая логика проверки хода ----------
function isAdjacentForward(prev, next) {
  const dr = next[0] - prev[0];
  const dc = next[1] - prev[1];
  return (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
}

function canAddCell(r, c) {
  // клетка уже в текущем наборе — нельзя выбрать повторно
  if (selectedPath.some(([rr, cc]) => rr === r && cc === c)) return false;
  const last = selectedPath[selectedPath.length - 1];
  if (!last) return true; // первая буква — можно с любой клетки
  return isAdjacentForward(last, [r, c]);
}

function currentSelectionWord() {
  return selectedPath.map(([r, c]) => gridLetters[r][c]).join('');
}

function updateCurrentWordDisplay() {
  const el = document.getElementById('current-word-display');
  el.textContent = selectedPath.length ? currentSelectionWord() : '—';
}

function resetSelection() {
  selectedPath.forEach(([r, c]) => {
    cellEls[r][c].classList.remove('cell-selected');
  });
  selectedPath = [];
  updateCurrentWordDisplay();
}

// ---------- Добавление буквы (вызывается и тапом, и джойстиком) ----------
function tryAddCell(r, c) {
  if (!gameActive) return false;
  if (!canAddCell(r, c)) {
    shakeCell(r, c);
    return false;
  }
  selectedPath.push([r, c]);
  cellEls[r][c].classList.add('cell-selected');
  updateCurrentWordDisplay();
  checkForCompletedWord();
  return true;
}

function shakeCell(r, c) {
  const el = cellEls[r][c];
  el.classList.add('cell-wrong');
  setTimeout(() => el.classList.remove('cell-wrong'), 260);
}

// ---------- Проверка, не сложилось ли уже готовое слово ----------
function pathsEqual(pathA, wordPath) {
  if (pathA.length !== wordPath.length) return false;
  return pathA.every(([r, c], i) => wordPath[i][0] === r && wordPath[i][1] === c);
}

function checkForCompletedWord() {
  const attempt = currentSelectionWord();
  if (wordPaths.has(attempt) && !foundWords.has(attempt)) {
    const correctPath = wordPaths.get(attempt);
    if (pathsEqual(selectedPath, correctPath)) {
      markWordFound(attempt, selectedPath);
      selectedPath = [];
      updateCurrentWordDisplay();
    }
  }
}

function markWordFound(word, path) {
  foundWords.add(word);
  path.forEach(([r, c]) => {
    cellEls[r][c].classList.add('cell-found');
    cellEls[r][c].classList.remove('cell-selected');
  });
  const chip = document.querySelector('.word-chip[data-word="' + CSS.escape(word) + '"]');
  if (chip) chip.classList.add('word-chip-done');

  updateProgress();
  showToast('«' + capitalize(word) + '» найдено ✓');

  if (foundWords.size === GRID_DATA.words.length) {
    finishGame(true);
  }
}

// ================================================================
//                    ВВОД 1: ТАП ПАЛЬЦЕМ / МЫШЬЮ
//   Превью увеличенной буквы появляется над пальцем при касании,
//   а сама буква добавляется в слово только при отпускании (как
//   выбор буквы в iOS-клавиатуре при наборе SMS).
// ================================================================

let touchingCell = null; // [r, c] или null

function showLetterPreview(clientX, clientY, letter, valid) {
  const preview = document.getElementById('letter-preview');
  preview.textContent = letter;
  preview.style.left = clientX + 'px';
  preview.style.top = (clientY - 56) + 'px'; // приподнимаем над пальцем
  preview.classList.toggle('invalid', !valid);
  preview.hidden = false;
}

function hideLetterPreview() {
  document.getElementById('letter-preview').hidden = true;
}

function getCellFromPoint(x, y) {
  const boardEl = document.getElementById('board');
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const cellEl = el.closest('.cell');
  if (!cellEl || !boardEl.contains(cellEl)) return null;
  return [parseInt(cellEl.dataset.r, 10), parseInt(cellEl.dataset.c, 10)];
}

function handleTouchStart(clientX, clientY) {
  if (!gameActive) return;
  const point = getCellFromPoint(clientX, clientY);
  if (!point) return;
  touchingCell = point;
  const [r, c] = point;
  cellEls[r][c].classList.add('cell-touching');
  showLetterPreview(clientX, clientY, gridLetters[r][c], canAddCell(r, c));
}

function handleTouchMove(clientX, clientY) {
  if (!touchingCell) return;
  const point = getCellFromPoint(clientX, clientY);
  if (point && (point[0] !== touchingCell[0] || point[1] !== touchingCell[1])) {
    const [pr, pc] = touchingCell;
    cellEls[pr][pc].classList.remove('cell-touching');
    touchingCell = point;
    const [r, c] = point;
    cellEls[r][c].classList.add('cell-touching');
  }
  if (touchingCell) {
    const [r, c] = touchingCell;
    showLetterPreview(clientX, clientY, gridLetters[r][c], canAddCell(r, c));
  }
}

function handleTouchEnd() {
  hideLetterPreview();
  if (!touchingCell) return;
  const [r, c] = touchingCell;
  cellEls[r][c].classList.remove('cell-touching');
  touchingCell = null;
  tryAddCell(r, c);
}

function setupTapInput() {
  const boardEl = document.getElementById('board');

  // Мышь (десктоп)
  boardEl.addEventListener('mousedown', (e) => {
    const cellEl = e.target.closest('.cell');
    if (!cellEl) return;
    handleTouchStart(e.clientX, e.clientY);
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (touchingCell) handleTouchMove(e.clientX, e.clientY);
  });
  document.addEventListener('mouseup', () => {
    if (touchingCell) handleTouchEnd();
  });

  // Touch (мобильные)
  boardEl.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    handleTouchStart(touch.clientX, touch.clientY);
    e.preventDefault();
  }, { passive: false });
  document.addEventListener('touchmove', (e) => {
    if (!touchingCell) return;
    const touch = e.touches[0];
    handleTouchMove(touch.clientX, touch.clientY);
    e.preventDefault();
  }, { passive: false });
  document.addEventListener('touchend', () => {
    if (touchingCell) handleTouchEnd();
  });
  document.addEventListener('touchcancel', () => {
    if (touchingCell) {
      const [r, c] = touchingCell;
      cellEls[r][c].classList.remove('cell-touching');
      touchingCell = null;
      hideLetterPreview();
    }
  });
}

// ================================================================
//                    ВВОД 2: ДЖОЙСТИК
// ================================================================

function updateCursorHighlight() {
  document.querySelectorAll('.cell-cursor').forEach(el => el.classList.remove('cell-cursor'));
  const [r, c] = cursorPos;
  if (cellEls[r] && cellEls[r][c]) {
    cellEls[r][c].classList.add('cell-cursor');
  }
}

function moveCursor(dr, dc) {
  if (!gameActive) return;
  const [r, c] = cursorPos;
  const nr = Math.min(N - 1, Math.max(0, r + dr));
  const nc = Math.min(N - 1, Math.max(0, c + dc));
  cursorPos = [nr, nc];
  updateCursorHighlight();
  scrollCursorIntoView();
}

function scrollCursorIntoView() {
  const [r, c] = cursorPos;
  const el = cellEls[r] && cellEls[r][c];
  if (el && el.scrollIntoView) {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }
}

function pressOk() {
  if (!gameActive) return;
  const [r, c] = cursorPos;
  tryAddCell(r, c);
}

function setupJoystick() {
  document.getElementById('joy-up').addEventListener('click', () => moveCursor(-1, 0));
  document.getElementById('joy-down').addEventListener('click', () => moveCursor(1, 0));
  document.getElementById('joy-left').addEventListener('click', () => moveCursor(0, -1));
  document.getElementById('joy-right').addEventListener('click', () => moveCursor(0, 1));
  document.getElementById('joy-ok').addEventListener('click', pressOk);

  // Поддержка клавиатуры на ПК (стрелки + Enter/Пробел)
  document.addEventListener('keydown', (e) => {
    const gameScreen = document.getElementById('screen-game');
    if (!gameScreen.classList.contains('active')) return;
    switch (e.key) {
      case 'ArrowUp': moveCursor(-1, 0); e.preventDefault(); break;
      case 'ArrowDown': moveCursor(1, 0); e.preventDefault(); break;
      case 'ArrowLeft': moveCursor(0, -1); e.preventDefault(); break;
      case 'ArrowRight': moveCursor(0, 1); e.preventDefault(); break;
      case 'Enter':
      case ' ':
        pressOk();
        e.preventDefault();
        break;
    }
  });
}

// ---------- Тост-уведомление ----------
let toastTimeout = null;
function showToast(text) {
  const toastEl = document.getElementById('toast');
  toastEl.textContent = text;
  toastEl.classList.add('toast-visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toastEl.classList.remove('toast-visible');
  }, 1400);
}

// ---------- Завершение игры ----------
function finishGame(completed) {
  gameActive = false;
  stopTimer();

  const best = getBestTime();
  const isNewRecord = completed && (!best || secondsElapsed < best.seconds);
  const nowIso = new Date().toISOString();

  saveGameResult({
    date: nowIso,
    seconds: secondsElapsed,
    found: foundWords.size,
    completed: completed,
  });

  if (completed) {
    const overlay = document.getElementById('win-overlay');
    document.getElementById('win-time').textContent = formatTime(secondsElapsed);
    const recordEl = document.getElementById('win-record');
    recordEl.hidden = !isNewRecord;
    overlay.classList.add('visible');
  }
}

// ================================================================
//                    ИНИЦИАЛИЗАЦИЯ И ОБРАБОТЧИКИ
// ================================================================

function bindButton(id, handler) {
  const el = document.getElementById(id);
  if (!el) {
    console.error('Элемент не найден:', id);
    return;
  }
  el.addEventListener('click', handler);
}

function init() {
  renderValues();
  renderBestTimeNote();
  setupTapInput();
  setupJoystick();

  bindButton('btn-start', startGame);
  bindButton('btn-history', () => showScreen('history'));
  bindButton('btn-about', () => showScreen('about'));

  bindButton('btn-game-menu', () => showScreen('menu'));
  bindButton('btn-restart', () => {
    if (confirm('Начать игру заново? Текущий прогресс будет потерян.')) {
      startGame();
    }
  });

  bindButton('btn-clear-selection', resetSelection);

  bindButton('btn-history-back', () => showScreen('menu'));
  bindButton('btn-about-back', () => showScreen('menu'));

  bindButton('win-again', () => {
    document.getElementById('win-overlay').classList.remove('visible');
    startGame();
  });
  bindButton('win-menu', () => {
    document.getElementById('win-overlay').classList.remove('visible');
    showScreen('menu');
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
