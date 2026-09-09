(() => {
  'use strict';

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
    const history = loadHistory();
    history.unshift(entry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }

  function getBestTime() {
    const history = loadHistory();
    const completed = history.filter(h => h.completed);
    if (!completed.length) return null;
    return completed.reduce((best, h) => (h.seconds < best.seconds ? h : best));
  }

  // ---------- Навигация между экранами ----------
  const screens = {
    menu: document.getElementById('screen-menu'),
    game: document.getElementById('screen-game'),
    history: document.getElementById('screen-history'),
    about: document.getElementById('screen-about'),
  };

  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
    if (name === 'history') renderHistory();
    if (name === 'menu') renderBestTimeNote();
    window.scrollTo(0, 0);
  }

  document.addEventListener('click', (e) => {
    const navEl = e.target.closest('[data-nav]');
    if (!navEl) return;
    const target = navEl.getAttribute('data-nav');
    if (navEl.getAttribute('data-action') === 'new-game') {
      startGame();
    }
    showScreen(target);
  });

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

  // ---------- Рендер "лучшее время" на главном меню ----------
  function renderBestTimeNote() {
    const note = document.getElementById('best-time-note');
    const best = getBestTime();
    if (best) {
      note.hidden = false;
      note.textContent = `Ваш рекорд: ${formatTime(best.seconds)}`;
    } else {
      note.hidden = true;
    }
  }

  // ---------- Рендер истории игр ----------
  function renderHistory() {
    const container = document.getElementById('history-list');
    const history = loadHistory();

    if (!history.length) {
      container.innerHTML = `
        <div class="empty-state">
          <p class="empty-title">Пока нет сыгранных партий</p>
          <p class="empty-sub">Начните игру в главном меню — и первая запись появится здесь.</p>
        </div>`;
      return;
    }

    const best = getBestTime();

    container.innerHTML = `<div class="history-rows">${history.map(h => {
      const isBest = best && h.completed && h.seconds === best.seconds && h.date === best.date;
      return `
        <div class="history-row ${h.completed ? '' : 'history-row-incomplete'}">
          <div class="history-main">
            <span class="history-date">${formatDate(h.date)}</span>
            <span class="history-badge ${h.completed ? 'badge-done' : 'badge-partial'}">
              ${h.completed ? 'Пройдено' : 'Не завершено'}
            </span>
            ${isBest ? '<span class="history-badge badge-record">Рекорд</span>' : ''}
          </div>
          <div class="history-side">
            <span class="history-num">${h.found}<span class="history-num-sub">/17</span></span>
            <span class="history-time">${formatTime(h.seconds)}</span>
          </div>
        </div>`;
    }).join('')}</div>`;
  }

  // ---------- Рендер страницы "Об игре" ----------
  function renderValues() {
    const list = document.getElementById('value-list');
    list.innerHTML = VALUES_DATA.map(v => `
      <div class="value-item">
        <h3 class="value-word">${v.word}</h3>
        <p class="value-text">${v.text}</p>
      </div>
    `).join('');
  }
  renderValues();

  // ================================================================
  //                         ИГРОВОЙ ДВИЖОК
  // ================================================================

  const N = GRID_DATA.size;
  const gridLetters = GRID_DATA.grid.map(row => row.split(''));

  // Множество слов + быстрый доступ к пути по слову
  const wordPaths = new Map(); // WORD -> [[r,c], ...]
  GRID_DATA.words.forEach(w => wordPaths.set(w.word, w.path));

  let foundWords = new Set();
  let timerInterval = null;
  let secondsElapsed = 0;
  let gameActive = false;

  const boardEl = document.getElementById('board');
  const linesEl = document.getElementById('board-lines');
  const wordListEl = document.getElementById('word-list');
  const timerEl = document.getElementById('timer');
  const foundCountEl = document.getElementById('found-count');
  const progressFillEl = document.getElementById('progress-fill');
  const toastEl = document.getElementById('toast');

  // ---------- Построение поля ----------
  let cellEls = []; // [r][c] -> DOM element

  function buildBoard() {
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
    wordListEl.innerHTML = '';
    GRID_DATA.words
      .map(w => w.word)
      .sort((a, b) => a.localeCompare(b, 'ru'))
      .forEach(word => {
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
    timerEl.textContent = formatTime(0);
    timerInterval = setInterval(() => {
      secondsElapsed++;
      timerEl.textContent = formatTime(secondsElapsed);
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
  }

  document.getElementById('restart-btn').addEventListener('click', () => {
    if (confirm('Начать игру заново? Текущий прогресс будет потерян.')) {
      startGame();
    }
  });

  document.getElementById('win-again').addEventListener('click', () => {
    document.getElementById('win-overlay').classList.remove('visible');
    startGame();
  });
  document.getElementById('win-menu').addEventListener('click', () => {
    document.getElementById('win-overlay').classList.remove('visible');
    showScreen('menu');
  });

  // ---------- Прогресс ----------
  function updateProgress() {
    foundCountEl.textContent = foundWords.size;
    progressFillEl.style.width = `${(foundWords.size / GRID_DATA.words.length) * 100}%`;
  }

  // ---------- Выбор букв ----------
  let selecting = false;
  let selectedPath = []; // [[r,c], ...]

  function cellAt(r, c) {
    if (r < 0 || r >= N || c < 0 || c >= N) return null;
    return cellEls[r][c];
  }

  function isAdjacentOrthogonal(a, b) {
    const dr = Math.abs(a[0] - b[0]);
    const dc = Math.abs(a[1] - b[1]);
    return (dr + dc === 1); // строго вправо/влево/вверх/вниз, соседняя клетка
  }

  function isForwardMove(prev, next) {
    // Разрешено только движение вправо (c+1) или вниз (r+1) от предыдущей буквы.
    // Назад/вверх/влево — запрещено по условию игры.
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

    // Если навели на уже выбранную предпоследнюю клетку — откат на шаг назад (для удобства пальца)
    if (selectedPath.length >= 2) {
      const prevPrev = selectedPath[selectedPath.length - 2];
      if (prevPrev[0] === r && prevPrev[1] === c) {
        const removed = selectedPath.pop();
        cellEls[removed[0]][removed[1]].classList.remove('cell-selected');
        drawSelectionLine();
        return;
      }
    }

    if (last[0] === r && last[1] === c) return; // та же клетка

    if (!isAdjacentOrthogonal(last, point)) return; // не соседняя клетка по прямой
    if (!isForwardMove(last, point)) return; // разрешено только вправо/вниз

    // Не даём выбрать клетку, уже находящуюся в пути (без наступания на свой хвост)
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
        clearSelectionNoStyleReset(); // clear array only, keep found styling on cells
        return;
      }
    }

    // Слово не подошло — короткая анимация "не то" и снятие выделения
    flashWrong();
  }

  function clearSelectionNoStyleReset() {
    selectedPath.forEach(([r, c]) => {
      cellEls[r][c].classList.remove('cell-selected');
    });
    selectedPath = [];
    drawSelectionLine();
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
    const chip = wordListEl.querySelector(`[data-word="${CSS.escape(word)}"]`);
    if (chip) chip.classList.add('word-chip-done');

    updateProgress();
    showToast(`«${capitalize(word)}» найдено ✓`);

    if (foundWords.size === GRID_DATA.words.length) {
      finishGame(true);
    }
  }

  function capitalize(w) {
    return w.charAt(0) + w.slice(1).toLowerCase();
  }

  // ---------- SVG-линия соединения ----------
  function drawSelectionLine() {
    if (selectedPath.length < 2) {
      linesEl.innerHTML = '';
      return;
    }
    const rect = boardEl.getBoundingClientRect();
    const cellSize = rect.width / N;
    linesEl.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
    linesEl.setAttribute('width', rect.width);
    linesEl.setAttribute('height', rect.height);

    const points = selectedPath.map(([r, c]) => {
      const x = c * cellSize + cellSize / 2;
      const y = r * cellSize + cellSize / 2;
      return `${x},${y}`;
    }).join(' ');

    linesEl.innerHTML = `<polyline points="${points}" fill="none" stroke="var(--accent)" stroke-width="${Math.max(cellSize * 0.28, 6)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.35"/>`;
  }

  window.addEventListener('resize', drawSelectionLine);

  // ---------- Обработка ввода: мышь + touch ----------
  function getCellFromPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const cellEl = el.closest('.cell');
    if (!cellEl || !boardEl.contains(cellEl)) return null;
    return [parseInt(cellEl.dataset.r, 10), parseInt(cellEl.dataset.c, 10)];
  }

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

  // ---------- Тост-уведомление ----------
  let toastTimeout = null;
  function showToast(text) {
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

    saveGameResult({
      date: new Date().toISOString(),
      seconds: secondsElapsed,
      found: foundWords.size,
      completed,
    });

    if (completed) {
      const overlay = document.getElementById('win-overlay');
      document.getElementById('win-time').textContent = formatTime(secondsElapsed);
      const recordEl = document.getElementById('win-record');
      recordEl.hidden = !isNewRecord;
      overlay.classList.add('visible');
    }
  }

  // ---------- Инициализация ----------
  renderBestTimeNote();
})();
