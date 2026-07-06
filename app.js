/**
 * 智能科技計分牌 - 核心業務邏輯
 * 包含：手勢識別、雙擊編輯名稱、撤銷管理、Web Audio 音效合成、本地數據持久化
 */

// ==========================================================================
// 狀態管理 (State)
// ==========================================================================
const state = {
  teamAName: '隊伍 A',
  teamBName: '隊伍 B',
  teamAScore: 0,
  teamBScore: 0,
  setsCount: 1,
  isMuted: false,
  setScores: [] // 記錄各局已完成的分數 { teamA: x, teamB: y }
};

// 撤銷操作的歷史棧
const historyStack = [];
const MAX_HISTORY = 50;

// ==========================================================================
// DOM 元素引用
// ==========================================================================
const elNameA = document.getElementById('name-team-a');
const elNameB = document.getElementById('name-team-b');
const elScoreA = document.getElementById('score-team-a');
const elScoreB = document.getElementById('score-team-b');
const elSetsCount = document.getElementById('sets-count');

const cardScoreA = document.getElementById('score-card-a');
const cardScoreB = document.getElementById('score-card-b');
const cardSets = document.getElementById('sets-card');

const btnUndo = document.getElementById('btn-undo');
const btnSwap = document.getElementById('btn-swap');
const btnSound = document.getElementById('btn-sound');
const btnReset = document.getElementById('btn-reset');

const soundIconOn = document.getElementById('sound-icon-on');
const soundIconOff = document.getElementById('sound-icon-off');
const scoreboardContainer = document.getElementById('scoreboard');

// 重置確認彈窗 DOM 引用
const resetModal = document.getElementById('reset-modal');
const btnResetCancel = document.getElementById('btn-reset-cancel');
const btnResetConfirm = document.getElementById('btn-reset-confirm');

// 開新局確認彈窗 DOM 引用
const newSetModal = document.getElementById('new-set-modal');
const btnNewSetCancel = document.getElementById('btn-new-set-cancel');
const btnNewSetConfirm = document.getElementById('btn-new-set-confirm');

// 各局分數紀錄彈窗 DOM 引用
const historyModal = document.getElementById('history-modal');
const btnHistoryTrigger = document.getElementById('btn-history-trigger');
const btnHistoryClose = document.getElementById('btn-history-close');
const historyTableContainer = document.getElementById('history-table-container');

// ==========================================================================
// 音效產生器 (Web Audio API)
// ==========================================================================
let audioCtx = null;

/**
 * 延遲初始化 AudioContext (符合瀏覽器安全策略)
 */
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

/**
 * 播放特定互動的合成音效
 * @param {string} type - 音效類型 ('up' | 'down' | 'set' | 'action')
 */
function playSound(type) {
  if (state.isMuted) return;
  
  try {
    initAudio();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    switch (type) {
      case 'up':
        // 向上遞增音效：短促的升調
        osc.type = 'sine';
        osc.frequency.setValueAtTime(450, now);
        osc.frequency.exponentialRampToValueAtTime(750, now + 0.08);
        gainNode.gain.setValueAtTime(0.15, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
        break;
        
      case 'down':
        // 向下遞減音效：短促的降調
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(350, now + 0.08);
        gainNode.gain.setValueAtTime(0.15, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
        break;
        
      case 'set':
        // 局數變更音效：清脆的雙音諧振
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.04); // E5
        gainNode.gain.setValueAtTime(0.12, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.start(now);
        osc.stop(now + 0.18);
        break;
        
      case 'action':
        // 撤銷/重置/對調等系統操作音效：輕柔的電子嘀聲
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        gainNode.gain.setValueAtTime(0.08, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
        break;
    }
  } catch (e) {
    console.warn('Audio play failed:', e);
  }
}

// ==========================================================================
// 狀態保存與回滾 (Undo & LocalStorage)
// ==========================================================================

/**
 * 將當前狀態克隆並存入歷史記錄棧
 */
function saveStateToHistory() {
  if (historyStack.length >= MAX_HISTORY) {
    historyStack.shift();
  }
  historyStack.push(JSON.stringify(state));
  updateUndoButtonState();
}

/**
 * 撤銷上一步操作
 */
function undo() {
  if (historyStack.length === 0) return;
  
  const prevStateStr = historyStack.pop();
  const prevState = JSON.parse(prevStateStr);
  
  // 恢復狀態
  state.teamAName = prevState.teamAName;
  state.teamBName = prevState.teamBName;
  state.teamAScore = prevState.teamAScore;
  state.teamBScore = prevState.teamBScore;
  state.setsCount = prevState.setsCount;
  state.setScores = prevState.setScores || [];
  
  playSound('action');
  updateUI(true);
  saveToLocalStorage();
  updateUndoButtonState();
}

/**
 * 保存到本地 LocalStorage
 */
function saveToLocalStorage() {
  localStorage.setItem('neon_scoreboard_state', JSON.stringify(state));
}

/**
 * 從本地 LocalStorage 載入狀態
 */
function loadFromLocalStorage() {
  const saved = localStorage.getItem('neon_scoreboard_state');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      state.teamAName = parsed.teamAName || '隊伍 A';
      state.teamBName = parsed.teamBName || '隊伍 B';
      
      // 如果本地緩存中存的是舊的簡體預設值，升級為繁體
      if (state.teamAName === '队伍 A') state.teamAName = '隊伍 A';
      if (state.teamBName === '队伍 B') state.teamBName = '隊伍 B';
      
      state.teamAScore = parsed.teamAScore !== undefined ? parsed.teamAScore : 0;
      state.teamBScore = parsed.teamBScore !== undefined ? parsed.teamBScore : 0;
      state.setsCount = parsed.setsCount !== undefined ? parsed.setsCount : 1;
      state.isMuted = parsed.isMuted !== undefined ? parsed.isMuted : false;
      state.setScores = parsed.setScores || [];
    } catch (e) {
      console.error('Error parsing localStorage state:', e);
    }
  }
}

/**
 * 更新撤銷按鈕可用視覺狀態
 */
function updateUndoButtonState() {
  if (historyStack.length > 0) {
    btnUndo.removeAttribute('disabled');
    btnUndo.style.opacity = '1';
    btnUndo.style.cursor = 'pointer';
  } else {
    btnUndo.setAttribute('disabled', 'true');
    btnUndo.style.opacity = '0.3';
    btnUndo.style.cursor = 'not-allowed';
  }
}

// ==========================================================================
// 介面渲染更新 (UI Updates)
// ==========================================================================

/**
 * 將最新的狀態渲染至 DOM
 * @param {boolean} skipAnimation - 是否跳過數字變化彈跳動畫
 */
function updateUI(skipAnimation = false) {
  // 更新隊伍名稱
  elNameA.textContent = state.teamAName;
  elNameB.textContent = state.teamBName;
  
  // 更新分數，判定是否觸發微動畫
  updateElementNumber(elScoreA, state.teamAScore, skipAnimation);
  updateElementNumber(elScoreB, state.teamBScore, skipAnimation);
  
  // 更新局數
  updateElementNumber(elSetsCount, state.setsCount, skipAnimation);
  
  // 更新音響圖示
  if (state.isMuted) {
    soundIconOn.style.display = 'none';
    soundIconOff.style.display = 'block';
  } else {
    soundIconOn.style.display = 'block';
    soundIconOff.style.display = 'none';
  }
}

/**
 * 帶有過渡動畫地更新數字元素內容
 * @param {HTMLElement} element - 目標 DOM 節點
 * @param {number} newValue - 新的數值
 * @param {boolean} skipAnimation - 是否跳過動畫
 */
function updateElementNumber(element, newValue, skipAnimation) {
  const oldValue = parseInt(element.textContent, 10);
  if (oldValue === newValue) return;
  
  element.textContent = newValue;
  
  if (!skipAnimation) {
    element.classList.remove('digit-update');
    // 強制瀏覽器重繪以重新觸發關鍵影格動畫
    void element.offsetWidth; 
    element.classList.add('digit-update');
    
    // 監聽動畫結束事件，自動移除 class
    const clearAnim = () => {
      element.classList.remove('digit-update');
      element.removeEventListener('animationend', clearAnim);
    };
    element.addEventListener('animationend', clearAnim);
  }
}

// ==========================================================================
// 手勢互動處理 (Touch Gestures)
// ==========================================================================

/**
 * 註冊觸摸手勢監聽，適配點擊和多方向滑動
 * @param {HTMLElement} cardElement - 被綁定的卡片 DOM
 * @param {Object} callbacks - 手勢回呼函數集合
 */
function bindGesture(cardElement, callbacks) {
  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let swipeTriggered = false;

  // --- 行動裝置觸控手勢事件 ---
  cardElement.addEventListener('touchstart', (e) => {
    // 允許在輸入框中操作
    if (e.target.tagName === 'INPUT') return;
    
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    startTime = Date.now();
    swipeTriggered = false;
  }, { passive: true });

  cardElement.addEventListener('touchmove', (e) => {
    if (swipeTriggered) return;
    if (e.target.tagName === 'INPUT') return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;

    // 分數區域手勢：只處理向左滑動 (deltaX < -35)
    if (callbacks.onSwipeLeft && deltaX < -35 && Math.abs(deltaY) < 30) {
      swipeTriggered = true;
      callbacks.onSwipeLeft();
      showVisualRipple(cardElement, touch.clientX, touch.clientY);
    }
    
    // 局數區域手勢：向上滑動 (deltaY < -35) 或向下滑動 (deltaY > 35)
    if (callbacks.onSwipeUp && deltaY < -35 && Math.abs(deltaX) < 30) {
      swipeTriggered = true;
      callbacks.onSwipeUp();
      showVisualRipple(cardElement, touch.clientX, touch.clientY);
    }
    
    if (callbacks.onSwipeDown && deltaY > 35 && Math.abs(deltaX) < 30) {
      swipeTriggered = true;
      callbacks.onSwipeDown();
      showVisualRipple(cardElement, touch.clientX, touch.clientY);
    }
  }, { passive: true });

  cardElement.addEventListener('touchend', (e) => {
    if (e.target.tagName === 'INPUT') return;
    
    const endTime = Date.now();
    const duration = endTime - startTime;

    // 如果在此次手勢中沒有觸發滑動，且耗時短、移動距離小，則視作輕點
    if (!swipeTriggered && duration < 250) {
      const touch = e.changedTouches[0];
      const moveX = Math.abs(touch.clientX - startX);
      const moveY = Math.abs(touch.clientY - startY);

      if (moveX < 10 && moveY < 10) {
        if (callbacks.onTap) {
          callbacks.onTap();
          showVisualRipple(cardElement, touch.clientX, touch.clientY);
        }
      }
    }
  });

  // --- 桌面端滑鼠拖拽模擬滑動事件 ---
  let isMouseDown = false;
  let mouseSwipeTriggered = false;

  cardElement.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.button !== 0) return; // 僅限滑鼠左鍵
    isMouseDown = true;
    startX = e.clientX;
    startY = e.clientY;
    startTime = Date.now();
    mouseSwipeTriggered = false;
  });

  window.addEventListener('mousemove', (e) => {
    if (!isMouseDown || mouseSwipeTriggered) return;
    
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    // 模擬向左劃動 (減分)
    if (callbacks.onSwipeLeft && deltaX < -40 && Math.abs(deltaY) < 35) {
      mouseSwipeTriggered = true;
      callbacks.onSwipeLeft();
      showVisualRipple(cardElement, e.clientX, e.clientY);
    }
    
    // 模擬向上劃動 (加局)
    if (callbacks.onSwipeUp && deltaY < -40 && Math.abs(deltaX) < 35) {
      mouseSwipeTriggered = true;
      callbacks.onSwipeUp();
      showVisualRipple(cardElement, e.clientX, e.clientY);
    }
    
    // 模擬向下劃動 (減局)
    if (callbacks.onSwipeDown && deltaY > 40 && Math.abs(deltaX) < 35) {
      mouseSwipeTriggered = true;
      callbacks.onSwipeDown();
      showVisualRipple(cardElement, e.clientX, e.clientY);
    }
  });

  window.addEventListener('mouseup', () => {
    isMouseDown = false;
  });

  // 桌面端滑鼠點擊支援
  cardElement.addEventListener('click', (e) => {
    if (e.target.tagName === 'INPUT') return;
    // 過濾掉觸控裝置派發的模擬 click 事件
    if (e.detail === 0) return; 
    
    // 如果在此次滑鼠互動中觸發了滑動拖拽，則屏蔽點擊事件
    if (mouseSwipeTriggered) {
      mouseSwipeTriggered = false;
      return;
    }
    
    const clickDuration = Date.now() - startTime;
    // 拖拽停留時間太長則不視作有效輕點
    if (clickDuration > 300) return;
    
    if (callbacks.onTap) {
      callbacks.onTap();
      showVisualRipple(cardElement, e.clientX, e.clientY);
    }
  });
}

/**
 * 在卡片點擊/滑動位置產生酷炫的漣漪特效
 * @param {HTMLElement} element - 目標卡片元素
 * @param {number} pageX - 頁面 X 座標
 * @param {number} pageY - 頁面 Y 座標
 */
function showVisualRipple(element, pageX, pageY) {
  const rect = element.getBoundingClientRect();
  const x = pageX - rect.left;
  const y = pageY - rect.top;

  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  
  element.appendChild(ripple);
  
  ripple.addEventListener('animationend', () => {
    ripple.remove();
  });
}

// 綁定分數 A 操作 (點擊+1，左滑-1)
bindGesture(cardScoreA, {
  onTap: () => {
    saveStateToHistory();
    state.teamAScore += 1;
    playSound('up');
    updateUI();
    saveToLocalStorage();
  },
  onSwipeLeft: () => {
    if (state.teamAScore > 0) {
      saveStateToHistory();
      state.teamAScore -= 1;
      playSound('down');
      updateUI();
      saveToLocalStorage();
    }
  }
});

// 綁定分數 B 操作 (點擊+1，左滑-1)
bindGesture(cardScoreB, {
  onTap: () => {
    saveStateToHistory();
    state.teamBScore += 1;
    playSound('up');
    updateUI();
    saveToLocalStorage();
  },
  onSwipeLeft: () => {
    if (state.teamBScore > 0) {
      saveStateToHistory();
      state.teamBScore -= 1;
      playSound('down');
      updateUI();
      saveToLocalStorage();
    }
  }
});

// 綁定局數操作 (上滑+1，下滑-1)
bindGesture(cardSets, {
  onSwipeUp: () => {
    // 上滑局數 +1 時，彈出確認視窗是否開新局並保留分數
    showNewSetModal();
  },
  onSwipeDown: () => {
    if (state.setsCount > 1) {
      saveStateToHistory();
      // 回退局數，嘗試恢復上一局保存的分數
      if (state.setScores && state.setScores.length > 0) {
        const lastScores = state.setScores.pop();
        state.teamAScore = lastScores.teamA;
        state.teamBScore = lastScores.teamB;
      } else {
        state.teamAScore = 0;
        state.teamBScore = 0;
      }
      state.setsCount -= 1;
      playSound('set');
      updateUI();
      saveToLocalStorage();
    }
  }
});

// ==========================================================================
// 隊伍名稱雙擊編輯 (Name Editing)
// ==========================================================================

/**
 * 啟用名稱編輯框
 * @param {HTMLElement} labelElement - 顯示隊伍名稱的 h2 元素
 * @param {string} stateKey - state 對象中對應的屬性鍵值 ('teamAName' | 'teamBName')
 */
function startEditName(labelElement, stateKey) {
  const container = labelElement.parentElement;
  const currentText = state[stateKey];
  
  // 創建輸入框
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'team-name-input';
  input.value = currentText;
  input.maxLength = 6; // 限制為最多 6 個字 (支援約 3 中文字)
  
  // 替換節點
  container.replaceChild(input, labelElement);
  input.focus();
  input.select(); // 自動選中全部文字便於修改
  
  // 保存並恢復
  let finished = false;
  const finishEdit = () => {
    if (finished) return;
    finished = true;
    
    let nextName = input.value.trim();
    // 如果輸入為空，則保留原名
    if (!nextName) {
      nextName = currentText;
    }
    
    if (nextName !== currentText) {
      saveStateToHistory();
      state[stateKey] = nextName;
      saveToLocalStorage();
    }
    
    // 還原 h2 元素
    labelElement.textContent = nextName;
    container.replaceChild(labelElement, input);
  };
  
  // 綁定保存事件
  input.addEventListener('blur', finishEdit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      finishEdit();
      playSound('action');
    } else if (e.key === 'Escape') {
      // 撤銷編輯，還原名稱
      input.value = currentText;
      finishEdit();
    }
  });
}

// 綁定雙擊事件 (支援桌面端雙擊)
elNameA.addEventListener('dblclick', () => startEditName(elNameA, 'teamAName'));
elNameB.addEventListener('dblclick', () => startEditName(elNameB, 'teamBName'));

// 針對行動裝置觸控式螢幕的雙擊手勢適配
function addDoubleTapSupport(element, callback) {
  let lastTap = 0;
  element.addEventListener('touchend', (e) => {
    const currentTime = Date.now();
    const tapLength = currentTime - lastTap;
    if (tapLength < 300 && tapLength > 0) {
      e.preventDefault();
      callback();
    }
    lastTap = currentTime;
  });
}

addDoubleTapSupport(elNameA, () => startEditName(elNameA, 'teamAName'));
addDoubleTapSupport(elNameB, () => startEditName(elNameB, 'teamBName'));


// ==========================================================================
// 控制欄按鈕事件 (Control Actions)
// ==========================================================================

// 撤銷按鈕
btnUndo.addEventListener('click', undo);

// 對調位置按鈕
btnSwap.addEventListener('click', () => {
  saveStateToHistory();
  
  // 對調數據
  const tempName = state.teamAName;
  const tempScore = state.teamAScore;
  
  state.teamAName = state.teamBName;
  state.teamAScore = state.teamBScore;
  
  state.teamBName = tempName;
  state.teamBScore = tempScore;
  
  // 觸發酷炫的整體水平翻轉動畫
  scoreboardContainer.style.transition = 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s';
  scoreboardContainer.style.transform = 'scaleX(0.95) scaleY(0.95)';
  scoreboardContainer.style.opacity = '0.5';
  
  setTimeout(() => {
    updateUI(true);
    scoreboardContainer.style.transform = 'scaleX(1) scaleY(1)';
    scoreboardContainer.style.opacity = '1';
    playSound('action');
    saveToLocalStorage();
  }, 180);
});

// 靜音按鈕
btnSound.addEventListener('click', () => {
  state.isMuted = !state.isMuted;
  updateUI(true);
  saveToLocalStorage();
  
  // 只有在取消靜音時播放提示音
  if (!state.isMuted) {
    initAudio();
    playSound('action');
  }
});

// 顯示重置確認彈窗
btnReset.addEventListener('click', () => {
  // 如果分數和局數已經處於初始狀態，則無需彈窗重置
  if (state.teamAScore === 0 && state.teamBScore === 0 && state.setsCount === 1) {
    return;
  }
  
  // 顯示彈窗
  resetModal.classList.add('active');
  playSound('action');
});

// 確認重置按鈕
btnResetConfirm.addEventListener('click', () => {
  saveStateToHistory();
  state.teamAScore = 0;
  state.teamBScore = 0;
  state.setsCount = 1;
  state.setScores = []; // 清空各局分數紀錄
  
  playSound('action');
  updateUI();
  saveToLocalStorage();
  
  // 關閉彈窗
  resetModal.classList.remove('active');
});

// 取消重置按鈕
btnResetCancel.addEventListener('click', () => {
  resetModal.classList.remove('active');
  playSound('action');
});

// 點擊遮罩層空白區域關閉彈窗
resetModal.addEventListener('click', (e) => {
  if (e.target === resetModal) {
    resetModal.classList.remove('active');
    playSound('action');
  }
});

// --- 開新局彈窗控制邏輯 ---
function showNewSetModal() {
  newSetModal.classList.add('active');
  playSound('action');
}

btnNewSetConfirm.addEventListener('click', () => {
  saveStateToHistory();
  
  // 記錄當前分數至歷史數組
  if (!state.setScores) state.setScores = [];
  state.setScores.push({
    teamA: state.teamAScore,
    teamB: state.teamBScore
  });
  
  // 分數歸零，局數加 1
  state.teamAScore = 0;
  state.teamBScore = 0;
  state.setsCount += 1;
  
  playSound('set');
  updateUI();
  saveToLocalStorage();
  newSetModal.classList.remove('active');
});

btnNewSetCancel.addEventListener('click', () => {
  newSetModal.classList.remove('active');
  playSound('action');
});

newSetModal.addEventListener('click', (e) => {
  if (e.target === newSetModal) {
    newSetModal.classList.remove('active');
    playSound('action');
  }
});

// --- 各局分數紀錄彈窗與表格生成邏輯 ---
btnHistoryTrigger.addEventListener('click', () => {
  renderHistoryTable();
  historyModal.classList.add('active');
  playSound('action');
});

btnHistoryClose.addEventListener('click', () => {
  historyModal.classList.remove('active');
  playSound('action');
});

historyModal.addEventListener('click', (e) => {
  if (e.target === historyModal) {
    historyModal.classList.remove('active');
    playSound('action');
  }
});

/**
 * 動態渲染各局分數表格
 */
function renderHistoryTable() {
  // 複製一份已存局數分數，並追加當前進行中的實時分數
  const historyData = [...(state.setScores || [])];
  historyData.push({
    teamA: state.teamAScore,
    teamB: state.teamBScore
  });
  
  const totalSets = historyData.length;
  
  // 計算總分
  let totalA = 0;
  let totalB = 0;
  historyData.forEach(item => {
    totalA += item.teamA;
    totalB += item.teamB;
  });
  
  // 計算合適的字體大小，防表格寬度溢出 (自適應視窗寬度)
  const numCols = totalSets + 2; // 名稱欄 + N局欄 + 總分欄
  let fontSize = '1rem';
  if (numCols > 5) {
    // 每多一欄，字體按比例縮小，最小為 0.58rem
    fontSize = `${Math.max(0.58, 1 - (numCols - 5) * 0.08)}rem`;
  }
  
  // 生成 HTML 表格
  let html = `<table class="history-table" style="font-size: ${fontSize}">`;
  
  // 表頭
  html += '<thead><tr>';
  html += '<th>名稱</th>';
  for (let i = 1; i <= totalSets; i++) {
    const isActive = (i === totalSets) ? ' class="col-active-set"' : '';
    html += `<th${isActive}>第 ${i} 局${i === totalSets ? ' (今)' : ''}</th>`;
  }
  html += '<th>總分</th>';
  html += '</tr></thead>';
  
  // 隊伍 A 行
  html += '<tbody><tr>';
  html += `<td>${state.teamAName}</td>`;
  for (let i = 0; i < totalSets; i++) {
    const isActive = (i === totalSets - 1) ? ' class="col-active-set"' : '';
    html += `<td${isActive}>${historyData[i].teamA}</td>`;
  }
  html += `<td>${totalA}</td>`;
  html += '</tr>';
  
  // 隊伍 B 行
  html += '<tr>';
  html += `<td>${state.teamBName}</td>`;
  for (let i = 0; i < totalSets; i++) {
    const isActive = (i === totalSets - 1) ? ' class="col-active-set"' : '';
    html += `<td${isActive}>${historyData[i].teamB}</td>`;
  }
  html += `<td>${totalB}</td>`;
  html += '</tr></tbody>';
  
  html += '</table>';
  
  historyTableContainer.innerHTML = html;
}

// ==========================================================================
// 初始化引導 (Initialization)
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  loadFromLocalStorage();
  updateUI(true);
  updateUndoButtonState();
});
