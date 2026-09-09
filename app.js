// ================================================================
//  Филворд «Ценности большой страны»
//  Явные обработчики на каждый элемент — без единого делегирующего
//  document-level click listener, чтобы ошибка в одном сценарии
//  не могла заблокировать остальные кнопки.
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

// ---------- Рендер "лучшее время" на главном меню ----------
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

// ---------- Рендер истории игр ----------
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

// ---------- Рендер страницы "Об игре" ----------
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
let selecting = false;
let selectedPath = [];

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
  clearSelection();
  document.getElementById('win-overlay').classList.remove('visible');
  showScreen('game');
}

// ---------- Прогресс ----------
function updateProgress() {
  document.getElementById('found-count').textContent = foundWords.size;
  document.getElementById('progress-fill').style.width =
    (foundWords.size / GRID_DATA.words.length) * 100 + '%';
}

// ---------- Выбор букв ----------
function isAdjacentOrthogonal(a, b) {
  const dr = Math.abs(a[0] - b[0]);
  const dc = Math.abs(a[1] - b[1]);
  return (dr + dc === 1);
}

function isForwardMove(prev, next) {
  const dr = next[0] - prev[0];
  const dc = next[1] - prev[1];
  return (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
}

function clearSelection() {
  selectedPath.forEach(([r, c]) => {
    cellEls[r][c].classList.remove('cell-selected');
  });
  selectedPath = [];
  drawSelectionLine();
}

function addToSelection(r, c) {
  const point = [r, c];
  const last = selectedPath[selectedPath.length - 1];

  if (!last) {
    selectedPath.push(point);
    cellEls[r][c].classList.add('cell-selected');
    drawSelectionLine();
    return;
  }

  if (selectedPath.length >= 2) {
    const prevPrev = selectedPath[selectedPath.length - 2];
    if (prevPrev[0] === r && prevPrev[1] === c) {
      const removed = selectedPath.pop();
      cellEls[removed[0]][removed[1]].classList.remove('cell-selected');
      drawSelectionLine();
      return;
    }
  }

  if (last[0] === r && last[1] === c) return;
  if (!isAdjacentOrthogonal(last, point)) return;
  if (!isForwardMove(last, point)) return;
  if (selectedPath.some(([rr, cc]) => rr === r && cc === c)) return;

  selectedPath.push(point);
  cellEls[r][c].classList.add('cell-selected');
  drawSelectionLine();
}

function currentSelectionWord() {
  return selectedPath.map(([r, c]) => gridLetters[r][c]).join('');
}

function pathsEqual(pathA, wordPath) {
  if (pathA.length !== wordPath.length) return false;
  return pathA.every(([r, c], i) => wordPath[i][0] === r && wordPath[i][1] === c);
}

function finishSelection() {
  if (!gameActive) { clearSelection(); return; }
  if (selectedPath.length < 2) { clearSelection(); return; }

  const attempt = currentSelectionWord();

  if (wordPaths.has(attempt) && !foundWords.has(attempt)) {
    const correctPath = wordPaths.get(attempt);
    if (pathsEqual(selectedPath, correctPath)) {
      markWordFound(attempt, selectedPath);
      selectedPath = [];
      drawSelectionLine();
      return;
    }
  }

  flashWrong();
}

function flashWrong() {
  const cellsToFlash = selectedPath.slice();
  cellsToFlash.forEach(([r, c]) => cellEls[r][c].classList.add('cell-wrong'));
  showToast('Такого слова нет в списке');
  setTimeout(() => {
    cellsToFlash.forEach(([r, c]) => {
      cellEls[r][c].classList.remove('cell-wrong');
      cellEls[r][c].classList.remove('cell-selected');
    });
    selectedPath = [];
    drawSelectionLine();
  }, 320);
}

function markWordFound(word, path) {
  foundWords.add(word);
  path.forEach(([r, c]) => {
    cellEls[r][c].classList.add('cell-found');
  });
  const chip = document.querySelector('.word-chip[data-word="' + CSS.escape(word) + '"]');
  if (chip) chip.classList.add('word-chip-done');

  updateProgress();
  showToast('«' + capitalize(word) + '» найдено ✓');

  if (foundWords.size === GRID_DATA.words.length) {
    finishGame(true);
  }
}

// ---------- SVG-линия соединения ----------
function drawSelectionLine() {
  const linesEl = document.getElementById('board-lines');
  const boardEl = document.getElementById('board');
  if (selectedPath.length < 2) {
    linesEl.innerHTML = '';
    return;
  }
  const rect = boardEl.getBoundingClientRect();
  const cellSize = rect.width / N;
  linesEl.setAttribute('viewBox', '0 0 ' + rect.width + ' ' + rect.height);
  linesEl.setAttribute('width', rect.width);
  linesEl.setAttribute('height', rect.height);

  const points = selectedPath.map(([r, c]) => {
    const x = c * cellSize + cellSize / 2;
    const y = r * cellSize + cellSize / 2;
    return x + ',' + y;
  }).join(' ');

  const strokeWidth = Math.max(cellSize * 0.28, 6);
  linesEl.innerHTML =
    '<polyline points="' + points + '" fill="none" stroke="#FF6B4A" stroke-width="' +
    strokeWidth + '" stroke-linecap="round" stroke-linejoin="round" opacity="0.35"/>';
}

// ---------- Обработка ввода: мышь + touch ----------
function getCellFromPoint(x, y) {
  const boardEl = document.getElementById('board');
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const cellEl = el.closest('.cell');
  if (!cellEl || !boardEl.contains(cellEl)) return null;
  return [parseInt(cellEl.dataset.r, 10), parseInt(cellEl.dataset.c, 10)];
}

function setupBoardInput() {
  const boardEl = document.getElementById('board');

  boardEl.addEventListener('mousedown', (e) => {
    if (!gameActive) return;
    const cellEl = e.target.closest('.cell');
    if (!cellEl) return;
    selecting = true;
    clearSelection();
    addToSelection(parseInt(cellEl.dataset.r, 10), parseInt(cellEl.dataset.c, 10));
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!selecting) return;
    const point = getCellFromPoint(e.clientX, e.clientY);
    if (point) addToSelection(point[0], point[1]);
  });

  document.addEventListener('mouseup', () => {
    if (!selecting) return;
    selecting = false;
    finishSelection();
  });

  boardEl.addEventListener('touchstart', (e) => {
    if (!gameActive) return;
    const touch = e.touches[0];
    const point = getCellFromPoint(touch.clientX, touch.clientY);
    if (!point) return;
    selecting = true;
    clearSelection();
    addToSelection(point[0], point[1]);
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchmove', (e) => {
    if (!selecting) return;
    const touch = e.touches[0];
    const point = getCellFromPoint(touch.clientX, touch.clientY);
    if (point) addToSelection(point[0], point[1]);
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchend', () => {
    if (!selecting) return;
    selecting = false;
    finishSelection();
  });

  window.addEventListener('resize', drawSelectionLine);
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
  setupBoardInput();

  bindButton('btn-start', startGame);
  bindButton('btn-history', () => showScreen('history'));
  bindButton('btn-about', () => showScreen('about'));

  bindButton('btn-game-menu', () => showScreen('menu'));
  bindButton('btn-restart', () => {
    if (confirm('Начать игру заново? Текущий прогресс будет потерян.')) {
      startGame();
    }
  });

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
