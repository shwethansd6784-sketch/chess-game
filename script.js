/**
 * Chess Arena — Two Player Chess
 * Main Application Logic & Rules Controller
 * Powered by chess.js and Web Audio API
 */

(function () {
  'use strict';

  // ==================== AUDIO SYNTHESIZER ====================
  // Synthesizes high-fidelity chess audio effects via Web Audio API.
  // 100% offline, zero-latency, zero external network dependency.
  const SoundEngine = {
    ctx: null,
    muted: false,

    init() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    },

    setMuted(muted) {
      this.muted = !!muted;
    },

    playMove() {
      if (this.muted) return;
      this.init();
      if (!this.ctx) return;

      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, t);
      osc.frequency.exponentialRampToValueAtTime(75, t + 0.08);

      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.09);
    },

    playCapture() {
      if (this.muted) return;
      this.init();
      if (!this.ctx) return;

      const t = this.ctx.currentTime;
      // Impact thud
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(450, t);
      osc.frequency.exponentialRampToValueAtTime(90, t + 0.12);

      gain.gain.setValueAtTime(0.5, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.13);

      // Noise burst for crisp tactile snap
      this.playNoise(t, 0.04, 0.2);
    },

    playCastle() {
      if (this.muted) return;
      this.init();
      if (!this.ctx) return;

      // Two rapid move clicks
      this.playMove();
      setTimeout(() => this.playMove(), 110);
    },

    playCheck() {
      if (this.muted) return;
      this.init();
      if (!this.ctx) return;

      const t = this.ctx.currentTime;
      // High alert dual-chime
      [659.25, 880].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + idx * 0.06);

        gain.gain.setValueAtTime(0.25, t + idx * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.06 + 0.35);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(t + idx * 0.06);
        osc.stop(t + idx * 0.06 + 0.36);
      });
    },

    playGameOver(isVictory = true) {
      if (this.muted) return;
      this.init();
      if (!this.ctx) return;

      const t = this.ctx.currentTime;
      const notes = isVictory ? [523.25, 659.25, 783.99, 1046.5] : [440, 415.3, 392, 349.23];
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t + idx * 0.1);

        gain.gain.setValueAtTime(0.3, t + idx * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.1 + 0.4);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(t + idx * 0.1);
        osc.stop(t + idx * 0.1 + 0.45);
      });
    },

    playNoise(startTime, duration, volume) {
      if (!this.ctx) return;
      const bufferSize = this.ctx.sampleRate * duration;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(volume, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      noise.connect(gain);
      gain.connect(this.ctx.destination);

      noise.start(startTime);
    }
  };

  // ==================== APP STATE ====================
  const State = {
    game: null, // Chess instance
    boardOrientation: 'w', // 'w' (White bottom) or 'b' (Black bottom)
    autoFlip: false, // Auto-flip board on turn change
    selectedSquare: null, // 'e4', etc.
    legalMovesForSelected: [],
    lastMove: null, // { from: 'e2', to: 'e4' }
    isGameOver: false,
    gameOverReason: '',

    // Time Control
    timeControl: 0, // 0 = unlimited, or seconds (180, 300, 600)
    whiteTime: 0,
    blackTime: 0,
    timerInterval: null,

    // Pawn Promotion
    pendingPromotion: null, // { from: 'e7', to: 'e8' }

    // Sound & Theme
    soundMuted: false,
    currentTheme: 'emerald',

    // Pointer Drag & Drop State
    drag: {
      active: false,
      square: null,
      pieceEl: null,
      ghostEl: null,
      startX: 0,
      startY: 0
    }
  };

  // Piece point values for material lead calculation
  const PIECE_VALUES = {
    p: 1,
    n: 3,
    b: 3,
    r: 5,
    q: 9,
    k: 0
  };

  // ==================== DOM ELEMENTS ====================
  const DOM = {
    board: document.getElementById('chessboard'),
    turnStatusPill: document.getElementById('turn-status-pill'),
    turnBannerText: document.getElementById('turn-banner-text'),
    gameStatusCard: document.getElementById('game-status-card'),
    statusTitle: document.getElementById('status-title'),
    statusDesc: document.getElementById('status-desc'),

    // Player Cards
    topCard: document.getElementById('top-player-card'),
    topName: document.getElementById('top-player-name'),
    topCapturedTray: document.getElementById('top-captured-tray'),
    topMaterialLead: document.getElementById('top-material-lead'),
    topClockDigits: document.getElementById('top-clock-time'),

    bottomCard: document.getElementById('bottom-player-card'),
    bottomName: document.getElementById('bottom-player-name'),
    bottomCapturedTray: document.getElementById('bottom-captured-tray'),
    bottomMaterialLead: document.getElementById('bottom-material-lead'),
    bottomClockDigits: document.getElementById('bottom-clock-time'),

    // Control buttons
    btnNewGame: document.getElementById('btn-new-game'),
    btnRestart: document.getElementById('btn-restart'),
    btnUndo: document.getElementById('btn-undo'),
    btnFlip: document.getElementById('btn-flip'),
    btnOfferDraw: document.getElementById('btn-offer-draw'),
    btnResign: document.getElementById('btn-resign'),
    toggleAutoFlip: document.getElementById('toggle-autoflip'),

    // History & Stats
    historyBody: document.getElementById('history-body'),
    historyContainer: document.getElementById('history-container'),
    btnCopyPgn: document.getElementById('btn-copy-pgn'),
    btnDownloadPgn: document.getElementById('btn-download-pgn'),
    statMoveCount: document.getElementById('stat-move-count'),
    statTimeControl: document.getElementById('stat-time-control'),

    // Header Actions
    themeSelect: document.getElementById('theme-select'),
    btnSoundToggle: document.getElementById('btn-sound-toggle'),
    iconSoundOn: document.getElementById('icon-sound-on'),
    iconSoundOff: document.getElementById('icon-sound-off'),
    btnOpenRules: document.getElementById('btn-open-rules'),

    // Modals
    modalWelcome: document.getElementById('modal-welcome'),
    welcomeAutoFlip: document.getElementById('welcome-autoflip'),
    btnStartGame: document.getElementById('btn-start-game'),

    modalPromotion: document.getElementById('modal-promotion'),
    promotionGrid: document.getElementById('promotion-pieces-grid'),

    modalDrawOffer: document.getElementById('modal-draw-offer'),
    drawOfferText: document.getElementById('draw-offer-text'),
    btnAcceptDraw: document.getElementById('btn-accept-draw'),
    btnDeclineDraw: document.getElementById('btn-decline-draw'),

    modalConfirm: document.getElementById('modal-confirm'),
    confirmTitle: document.getElementById('confirm-title'),
    confirmText: document.getElementById('confirm-text'),
    btnConfirmYes: document.getElementById('btn-confirm-yes'),
    btnConfirmNo: document.getElementById('btn-confirm-no'),

    modalGameOver: document.getElementById('modal-gameover'),
    gameOverTitle: document.getElementById('gameover-title'),
    gameOverReason: document.getElementById('gameover-reason'),
    gameOverTrophy: document.getElementById('gameover-trophy'),
    gameOverResultVal: document.getElementById('gameover-result-val'),
    gameOverMovesVal: document.getElementById('gameover-moves-val'),
    gameOverDetailsVal: document.getElementById('gameover-details-val'),
    btnGameOverRematch: document.getElementById('btn-gameover-rematch'),
    btnGameOverReview: document.getElementById('btn-gameover-review'),

    modalRules: document.getElementById('modal-rules'),
    btnCloseRules: document.getElementById('btn-close-rules'),

    toastContainer: document.getElementById('toast-container')
  };

  // ==================== INITIALIZATION ====================
  function initApp() {
    // Check if chess.js is loaded
    if (typeof Chess === 'undefined') {
      showToast('⚠️ Chess engine failed to load. Please check chess.min.js.');
      return;
    }

    State.game = new Chess();

    // Restore Sound setting from localStorage
    const savedMute = localStorage.getItem('chess_arena_muted');
    if (savedMute !== null) {
      State.soundMuted = savedMute === 'true';
      SoundEngine.setMuted(State.soundMuted);
      updateSoundIcons();
    }

    // Restore Theme setting
    const savedTheme = localStorage.getItem('chess_arena_theme');
    if (savedTheme) {
      State.currentTheme = savedTheme;
      document.body.setAttribute('data-theme', savedTheme);
      DOM.themeSelect.value = savedTheme;
    }

    // Bind event listeners
    bindEvents();

    // Show Welcome Screen on start
    DOM.modalWelcome.classList.remove('hidden');

    // Initial render
    renderBoard();
    updateUI();
  }

  // ==================== EVENT BINDINGS ====================
  function bindEvents() {
    // Unlock AudioContext on initial click anywhere
    document.addEventListener('pointerdown', () => SoundEngine.init(), { once: true });

    // Header buttons
    DOM.btnSoundToggle.addEventListener('click', toggleSound);
    DOM.themeSelect.addEventListener('change', (e) => setTheme(e.target.value));
    DOM.btnOpenRules.addEventListener('click', () => DOM.modalRules.classList.remove('hidden'));
    DOM.btnCloseRules.addEventListener('click', () => DOM.modalRules.classList.add('hidden'));

    // Game Controls
    DOM.btnNewGame.addEventListener('click', () => DOM.modalWelcome.classList.remove('hidden'));
    DOM.btnRestart.addEventListener('click', promptRestartGame);
    DOM.btnUndo.addEventListener('click', undoMove);
    DOM.btnFlip.addEventListener('click', toggleBoardOrientation);
    DOM.btnOfferDraw.addEventListener('click', promptOfferDraw);
    DOM.btnResign.addEventListener('click', promptResign);

    // Auto-flip toggles sync
    DOM.toggleAutoFlip.addEventListener('change', (e) => {
      State.autoFlip = e.target.checked;
      DOM.welcomeAutoFlip.checked = e.target.checked;
      showToast(`Auto-Flip: ${State.autoFlip ? 'Enabled' : 'Disabled'}`);
    });
    DOM.welcomeAutoFlip.addEventListener('change', (e) => {
      State.autoFlip = e.target.checked;
      DOM.toggleAutoFlip.checked = e.target.checked;
    });

    // Time Control buttons inside Welcome Modal
    const timeBtns = DOM.modalWelcome.querySelectorAll('.time-opt-btn');
    timeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        timeBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        State.timeControl = parseInt(btn.dataset.time, 10);
      });
    });

    // Start Game from Welcome Modal
    DOM.btnStartGame.addEventListener('click', () => {
      DOM.modalWelcome.classList.add('hidden');
      startNewMatch(State.timeControl);
    });

    // PGN Buttons
    DOM.btnCopyPgn.addEventListener('click', copyPgnToClipboard);
    DOM.btnDownloadPgn.addEventListener('click', downloadPgnFile);

    // Game Over Rematch & Review
    DOM.btnGameOverRematch.addEventListener('click', () => {
      DOM.modalGameOver.classList.add('hidden');
      DOM.modalWelcome.classList.remove('hidden');
    });
    DOM.btnGameOverReview.addEventListener('click', () => {
      DOM.modalGameOver.classList.add('hidden');
      showToast('Game review mode. You can examine the final board state.');
    });

    // Promotion buttons
    DOM.promotionGrid.querySelectorAll('.promo-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const piece = btn.dataset.piece;
        finishPawnPromotion(piece);
      });
    });

    // Pointer events for Drag & Drop and Click-to-Move on the board
    DOM.board.addEventListener('pointerdown', handleBoardPointerDown);
    document.addEventListener('pointermove', handleDocumentPointerMove);
    document.addEventListener('pointerup', handleDocumentPointerUp);
    document.addEventListener('pointercancel', handleDocumentPointerCancel);

    // Keyboard Shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);
  }

  // ==================== MATCH INITIALIZATION ====================
  function startNewMatch(timeSeconds = 0) {
    clearInterval(State.timerInterval);
    State.game.reset();
    State.selectedSquare = null;
    State.legalMovesForSelected = [];
    State.lastMove = null;
    State.isGameOver = false;
    State.gameOverReason = '';
    State.pendingPromotion = null;
    State.boardOrientation = 'w';

    State.timeControl = timeSeconds;
    State.whiteTime = timeSeconds;
    State.blackTime = timeSeconds;

    if (State.timeControl > 0) {
      startClockTimer();
    }

    renderBoard();
    updateUI();
    showToast('New game started! White to move.');
  }

  function resetGame() {
    startNewMatch(State.timeControl);
  }

  // ==================== RENDERING THE CHESSBOARD ====================
  function renderBoard() {
    DOM.board.innerHTML = '';

    const isWhiteBottom = State.boardOrientation === 'w';
    const ranks = isWhiteBottom ? ['8', '7', '6', '5', '4', '3', '2', '1'] : ['1', '2', '3', '4', '5', '6', '7', '8'];
    const files = isWhiteBottom ? ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] : ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'];

    const turn = State.game.turn();
    const kingInCheck = State.game.in_check();

    // Map legal target squares for quick lookup
    const legalTargets = new Map();
    if (State.selectedSquare && State.legalMovesForSelected.length > 0) {
      State.legalMovesForSelected.forEach((move) => {
        legalTargets.set(move.to, move);
      });
    }

    ranks.forEach((rank, rIdx) => {
      files.forEach((file, fIdx) => {
        const square = file + rank;
        const squareEl = document.createElement('div');
        squareEl.className = 'square';
        squareEl.dataset.square = square;
        squareEl.dataset.rank = rank;
        squareEl.dataset.file = file;

        // Alternating square color
        const isDark = (file.charCodeAt(0) - 97 + parseInt(rank, 10)) % 2 === 0;
        squareEl.classList.add(isDark ? 'dark' : 'light');

        // Selected square highlight
        if (State.selectedSquare === square) {
          squareEl.classList.add('selected');
        }

        // Last move highlight (from & to)
        if (State.lastMove && (State.lastMove.from === square || State.lastMove.to === square)) {
          squareEl.classList.add('last-move');
        }

        // Legal move or capture highlights
        if (legalTargets.has(square)) {
          const move = legalTargets.get(square);
          const hasPiece = State.game.get(square);
          const isEnPassant = move.flags.includes('e');
          if (hasPiece || isEnPassant) {
            squareEl.classList.add('legal-capture');
          } else {
            squareEl.classList.add('legal-move');
          }
        }

        // Coordinates display on edges
        if (rIdx === 7) {
          const fileLabel = document.createElement('span');
          fileLabel.className = 'square-coord coord-file';
          fileLabel.textContent = file;
          squareEl.appendChild(fileLabel);
        }
        if (fIdx === 0) {
          const rankLabel = document.createElement('span');
          rankLabel.className = 'square-coord coord-rank';
          rankLabel.textContent = rank;
          squareEl.appendChild(rankLabel);
        }

        // Piece rendering
        const piece = State.game.get(square);
        if (piece) {
          const isMyPiece = piece.color === turn;
          const pieceImg = document.createElement('img');
          const pieceCode = piece.color + piece.type.toUpperCase();
          pieceImg.src = `assets/pieces/${pieceCode}.svg`;
          pieceImg.className = 'piece';
          pieceImg.alt = `${piece.color === 'w' ? 'White' : 'Black'} ${getPieceFullName(piece.type)}`;
          pieceImg.draggable = false;
          pieceImg.dataset.square = square;

          if (isMyPiece && !State.isGameOver) {
            pieceImg.classList.add('movable');
          }

          // In-check King highlight
          if (kingInCheck && piece.type === 'k' && piece.color === turn) {
            squareEl.classList.add('in-check');
          }

          squareEl.appendChild(pieceImg);
        }

        DOM.board.appendChild(squareEl);
      });
    });
  }

  // ==================== POINTER INTERACTIONS (DRAG & CLICK) ====================
  function handleBoardPointerDown(e) {
    if (State.isGameOver) return;

    // Find the clicked square
    const squareEl = e.target.closest('.square');
    if (!squareEl) return;

    const square = squareEl.dataset.square;
    const piece = State.game.get(square);
    const turn = State.game.turn();

    // Case 1: Clicked on a legal destination for currently selected piece -> execute move
    if (State.selectedSquare && isLegalDestination(square)) {
      attemptMove(State.selectedSquare, square);
      return;
    }

    // Case 2: Clicked on active player's own piece -> select it & initiate drag
    if (piece && piece.color === turn) {
      const wasAlreadySelected = State.selectedSquare === square;
      selectSquare(square);

      const pieceEl = squareEl.querySelector('.piece');
      if (pieceEl) {
        State.drag.active = true;
        State.drag.square = square;
        State.drag.wasAlreadySelected = wasAlreadySelected;
        State.drag.pieceEl = pieceEl;
        State.drag.startX = e.clientX;
        State.drag.startY = e.clientY;

        // Create floating ghost element
        const ghost = pieceEl.cloneNode(true);
        ghost.className = 'drag-ghost';
        ghost.style.left = `${e.clientX}px`;
        ghost.style.top = `${e.clientY}px`;
        document.body.appendChild(ghost);
        State.drag.ghostEl = ghost;

        pieceEl.style.opacity = '0.35';
      }
      return;
    }

    // Case 3: Clicked empty square or opponent's piece when not making a legal move -> deselect
    deselectSquare();
  }

  function handleDocumentPointerMove(e) {
    if (!State.drag.active || !State.drag.ghostEl) return;
    State.drag.ghostEl.style.left = `${e.clientX}px`;
    State.drag.ghostEl.style.top = `${e.clientY}px`;
  }

  function handleDocumentPointerUp(e) {
    if (!State.drag.active) return;

    const dragSquare = State.drag.square;
    const pieceEl = State.drag.pieceEl;
    const ghostEl = State.drag.ghostEl;
    const wasAlreadySelected = State.drag.wasAlreadySelected;

    // Reset visual opacity and remove ghost
    if (pieceEl) pieceEl.style.opacity = '1';
    if (ghostEl) ghostEl.remove();

    State.drag.active = false;
    State.drag.ghostEl = null;

    // Calculate distance moved
    const dx = Math.abs(e.clientX - State.drag.startX);
    const dy = Math.abs(e.clientY - State.drag.startY);
    const wasRealDrag = dx > 10 || dy > 10;

    // Identify target square under cursor
    const elementUnderCursor = document.elementFromPoint(e.clientX, e.clientY);
    const targetSquareEl = elementUnderCursor ? elementUnderCursor.closest('.square') : null;

    if (wasRealDrag && targetSquareEl) {
      const targetSquare = targetSquareEl.dataset.square;
      if (targetSquare && targetSquare !== dragSquare && isLegalDestination(targetSquare)) {
        attemptMove(dragSquare, targetSquare);
        return;
      }
    }

    // If it was just a gentle click on an already-selected piece, toggle deselect
    if (!wasRealDrag && wasAlreadySelected) {
      deselectSquare();
      return;
    }

    // Keep piece selected for click-to-move
    renderBoard();
  }

  function handleDocumentPointerCancel() {
    if (!State.drag.active) return;
    if (State.drag.pieceEl) State.drag.pieceEl.style.opacity = '1';
    if (State.drag.ghostEl) State.drag.ghostEl.remove();
    State.drag.active = false;
    State.drag.ghostEl = null;
    renderBoard();
  }

  function selectSquare(square) {
    State.selectedSquare = square;
    State.legalMovesForSelected = State.game.moves({ square: square, verbose: true });
    renderBoard();
  }

  function deselectSquare() {
    State.selectedSquare = null;
    State.legalMovesForSelected = [];
    renderBoard();
  }

  function isLegalDestination(square) {
    return State.legalMovesForSelected.some((m) => m.to === square);
  }

  // ==================== MOVE EXECUTION & RULES ====================
  function attemptMove(from, to) {
    // Check for Pawn Promotion requirement
    const piece = State.game.get(from);
    const isPawnPromotion =
      piece &&
      piece.type === 'p' &&
      ((piece.color === 'w' && to.charAt(1) === '8') || (piece.color === 'b' && to.charAt(1) === '1'));

    if (isPawnPromotion) {
      // Check if move is legal
      const legal = State.legalMovesForSelected.some((m) => m.to === to);
      if (legal) {
        openPromotionModal(from, to, piece.color);
        return;
      }
    }

    // Standard move execution
    commitMove(from, to);
  }

  function commitMove(from, to, promotion = null) {
    const moveConfig = { from, to };
    if (promotion) moveConfig.promotion = promotion;

    const moveResult = State.game.move(moveConfig);
    if (!moveResult) {
      // Illegal move
      SoundEngine.playNoise(SoundEngine.ctx ? SoundEngine.ctx.currentTime : 0, 0.05, 0.1);
      deselectSquare();
      return;
    }

    // Successfully made move!
    State.lastMove = { from, to };
    State.selectedSquare = null;
    State.legalMovesForSelected = [];

    // Trigger audio feedback based on move characteristics
    if (State.game.in_checkmate()) {
      SoundEngine.playGameOver(true);
    } else if (State.game.in_check()) {
      SoundEngine.playCheck();
    } else if (moveResult.flags.includes('k') || moveResult.flags.includes('q')) {
      SoundEngine.playCastle();
    } else if (moveResult.captured) {
      SoundEngine.playCapture();
    } else {
      SoundEngine.playMove();
    }

    // Check game termination conditions
    checkGameOverConditions();

    // Auto-flip orientation if enabled and game not over
    if (State.autoFlip && !State.isGameOver) {
      State.boardOrientation = State.boardOrientation === 'w' ? 'b' : 'w';
    }

    // Update board, history, captured pieces, turn status
    renderBoard();
    updateUI();
  }

  // ==================== PAWN PROMOTION ====================
  function openPromotionModal(from, to, color) {
    State.pendingPromotion = { from, to };

    // Update promotion icons according to pawn's color
    const promoTypes = ['q', 'r', 'b', 'n'];
    promoTypes.forEach((type) => {
      const wrap = document.getElementById(`promo-img-${type}`);
      if (wrap) {
        wrap.innerHTML = `<img src="assets/pieces/${color}${type.toUpperCase()}.svg" alt="${type}">`;
      }
    });

    DOM.modalPromotion.classList.remove('hidden');
  }

  function finishPawnPromotion(pieceType) {
    DOM.modalPromotion.classList.add('hidden');
    if (State.pendingPromotion) {
      const { from, to } = State.pendingPromotion;
      State.pendingPromotion = null;
      commitMove(from, to, pieceType);
    }
  }

  // ==================== GAME TERMINATION & CHECKS ====================
  function checkGameOverConditions() {
    if (State.game.in_checkmate()) {
      State.isGameOver = true;
      const winner = State.game.turn() === 'w' ? 'Black' : 'White';
      const winnerPlayer = State.game.turn() === 'w' ? 'Player 2 (Black)' : 'Player 1 (White)';
      State.gameOverReason = `Checkmate! ${winnerPlayer} wins!`;
      stopClockTimer();
      showGameOverModal({
        title: 'Checkmate!',
        subtitle: `${winnerPlayer} emerges victorious!`,
        result: winner === 'White' ? '1 - 0' : '0 - 1',
        reason: 'Checkmate',
        trophy: '🏆'
      });
      return;
    }

    if (State.game.in_stalemate()) {
      State.isGameOver = true;
      State.gameOverReason = 'Draw by Stalemate! The player has no legal moves.';
      stopClockTimer();
      showGameOverModal({
        title: 'Draw — Stalemate',
        subtitle: 'The player to move is not in check and has no legal moves.',
        result: '½ - ½',
        reason: 'Stalemate',
        trophy: '🤝'
      });
      return;
    }

    if (State.game.insufficient_material()) {
      State.isGameOver = true;
      State.gameOverReason = 'Draw by Insufficient Material!';
      stopClockTimer();
      showGameOverModal({
        title: 'Draw — Insufficient Material',
        subtitle: 'Neither player has enough pieces to deliver checkmate.',
        result: '½ - ½',
        reason: 'Insufficient Material',
        trophy: '🤝'
      });
      return;
    }

    if (State.game.in_threefold_repetition()) {
      State.isGameOver = true;
      State.gameOverReason = 'Draw by Threefold Repetition!';
      stopClockTimer();
      showGameOverModal({
        title: 'Draw — Threefold Repetition',
        subtitle: 'The exact same board position has occurred 3 times.',
        result: '½ - ½',
        reason: 'Threefold Repetition',
        trophy: '🤝'
      });
      return;
    }

    if (State.game.in_draw()) {
      State.isGameOver = true;
      State.gameOverReason = 'Draw by 50-Move Rule!';
      stopClockTimer();
      showGameOverModal({
        title: 'Draw — 50-Move Rule',
        subtitle: '50 consecutive moves completed without a capture or pawn advance.',
        result: '½ - ½',
        reason: '50-Move Rule',
        trophy: '🤝'
      });
      return;
    }
  }

  function showGameOverModal({ title, subtitle, result, reason, trophy }) {
    DOM.gameOverTitle.textContent = title;
    DOM.gameOverReason.textContent = subtitle;
    DOM.gameOverTrophy.textContent = trophy || '🏆';
    DOM.gameOverResultVal.textContent = result;
    DOM.gameOverMovesVal.textContent = State.game.history().length;
    DOM.gameOverDetailsVal.textContent = reason;
    DOM.modalGameOver.classList.remove('hidden');
  }

  // ==================== CLOCKS & TIMERS ====================
  function startClockTimer() {
    clearInterval(State.timerInterval);
    State.timerInterval = setInterval(() => {
      if (State.isGameOver) return;

      const activeColor = State.game.turn();
      if (activeColor === 'w') {
        State.whiteTime--;
        if (State.whiteTime <= 0) {
          State.whiteTime = 0;
          handleTimeout('w');
        }
      } else {
        State.blackTime--;
        if (State.blackTime <= 0) {
          State.blackTime = 0;
          handleTimeout('b');
        }
      }

      updateClockDisplay();
    }, 1000);
  }

  function stopClockTimer() {
    clearInterval(State.timerInterval);
  }

  function handleTimeout(flaggedColor) {
    stopClockTimer();
    State.isGameOver = true;
    const winner = flaggedColor === 'w' ? 'Black' : 'White';
    const winnerPlayer = flaggedColor === 'w' ? 'Player 2 (Black)' : 'Player 1 (White)';

    SoundEngine.playGameOver(true);
    showGameOverModal({
      title: 'Time Out!',
      subtitle: `${flaggedColor === 'w' ? 'White' : 'Black'} ran out of time. ${winnerPlayer} wins!`,
      result: winner === 'White' ? '1 - 0' : '0 - 1',
      reason: 'Clock Timeout',
      trophy: '⏱️'
    });
  }

  function formatTime(totalSeconds) {
    if (totalSeconds <= 0) return '00:00';
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function updateClockDisplay() {
    if (State.timeControl === 0) {
      DOM.topClockDigits.textContent = '∞';
      DOM.bottomClockDigits.textContent = '∞';
      DOM.topClockDigits.parentElement.classList.remove('urgent');
      DOM.bottomClockDigits.parentElement.classList.remove('urgent');
      return;
    }

    const topIsWhite = State.boardOrientation === 'b';
    const topSeconds = topIsWhite ? State.whiteTime : State.blackTime;
    const bottomSeconds = topIsWhite ? State.blackTime : State.whiteTime;

    DOM.topClockDigits.textContent = formatTime(topSeconds);
    DOM.bottomClockDigits.textContent = formatTime(bottomSeconds);

    DOM.topClockDigits.parentElement.classList.toggle('urgent', topSeconds < 30);
    DOM.bottomClockDigits.parentElement.classList.toggle('urgent', bottomSeconds < 30);
  }

  // ==================== UI & STATUS UPDATES ====================
  function updateUI() {
    const turn = State.game.turn();
    const isWhiteTurn = turn === 'w';
    const kingInCheck = State.game.in_check();

    // 1. Header Turn Status Pill
    const turnText = isWhiteTurn ? "White's Turn" : "Black's Turn";
    DOM.turnBannerText.textContent = kingInCheck ? `${turnText} (CHECK!)` : turnText;
    const turnDot = DOM.turnStatusPill.querySelector('.turn-dot');
    turnDot.className = `turn-dot ${kingInCheck ? 'check-dot' : isWhiteTurn ? 'white-dot' : 'black-dot'}`;

    // 2. Sidebar Game Status Card
    if (State.isGameOver) {
      DOM.statusTitle.textContent = 'Match Finished';
      DOM.statusDesc.textContent = State.gameOverReason;
      DOM.gameStatusCard.classList.remove('check-active');
    } else if (kingInCheck) {
      DOM.statusTitle.textContent = `${isWhiteTurn ? 'White' : 'Black'} is in CHECK!`;
      DOM.statusDesc.textContent = 'The King is under attack and must be protected or moved!';
      DOM.gameStatusCard.classList.add('check-active');
    } else {
      DOM.statusTitle.textContent = `${turnText} to Move`;
      DOM.statusDesc.textContent = 'Click or drag a piece to view legal options.';
      DOM.gameStatusCard.classList.remove('check-active');
    }

    // 3. Player Cards (Orientation-Aware Top & Bottom Cards)
    const isTopWhite = State.boardOrientation === 'b';
    const topColor = isTopWhite ? 'w' : 'b';
    const bottomColor = isTopWhite ? 'b' : 'w';

    DOM.topCard.dataset.color = topColor;
    DOM.topName.textContent = topColor === 'w' ? 'Player 1 (White)' : 'Player 2 (Black)';
    DOM.topCard.querySelector('.avatar-piece-img').src = `assets/pieces/${topColor}K.svg`;
    DOM.topCard.querySelector('.player-avatar').className = `player-avatar ${topColor === 'w' ? 'white-avatar' : 'black-avatar'}`;

    DOM.bottomCard.dataset.color = bottomColor;
    DOM.bottomName.textContent = bottomColor === 'w' ? 'Player 1 (White)' : 'Player 2 (Black)';
    DOM.bottomCard.querySelector('.avatar-piece-img').src = `assets/pieces/${bottomColor}K.svg`;
    DOM.bottomCard.querySelector('.player-avatar').className = `player-avatar ${bottomColor === 'w' ? 'white-avatar' : 'black-avatar'}`;

    // Active Card highlights
    DOM.topCard.classList.toggle('active-turn', turn === topColor && !State.isGameOver);
    DOM.bottomCard.classList.toggle('active-turn', turn === bottomColor && !State.isGameOver);

    DOM.topCard.classList.toggle('in-check', kingInCheck && turn === topColor);
    DOM.bottomCard.classList.toggle('in-check', kingInCheck && turn === bottomColor);

    // 4. Update Captured Pieces & Material Lead
    updateCapturedPiecesAndLead(topColor, bottomColor);

    // 5. Update Move History Table
    updateMoveHistoryTable();

    // 6. Update Clocks
    updateClockDisplay();

    // 7. Update Stats Footer
    const history = State.game.history();
    DOM.statMoveCount.textContent = history.length;
    DOM.statTimeControl.textContent =
      State.timeControl === 0
        ? 'Casual (Untimed)'
        : `${Math.round(State.timeControl / 60)} Min ${State.timeControl <= 300 ? 'Blitz' : 'Rapid'}`;
  }

  // ==================== CAPTURED PIECES & MATERIAL LEAD ====================
  function updateCapturedPiecesAndLead(topColor, bottomColor) {
    const history = State.game.history({ verbose: true });

    // Pieces captured by White (which were Black pieces)
    const whiteCaptures = history.filter((m) => m.color === 'w' && m.captured).map((m) => m.captured);
    // Pieces captured by Black (which were White pieces)
    const blackCaptures = history.filter((m) => m.color === 'b' && m.captured).map((m) => m.captured);

    // Compute board material totals
    const board = State.game.board();
    let whiteMaterial = 0;
    let blackMaterial = 0;

    board.forEach((row) => {
      row.forEach((piece) => {
        if (piece) {
          const val = PIECE_VALUES[piece.type] || 0;
          if (piece.color === 'w') whiteMaterial += val;
          else blackMaterial += val;
        }
      });
    });

    const lead = whiteMaterial - blackMaterial; // Positive = White lead, Negative = Black lead

    // Render trays
    const topCaptures = topColor === 'w' ? whiteCaptures : blackCaptures;
    const bottomCaptures = bottomColor === 'w' ? whiteCaptures : blackCaptures;
    const opponentTopPieceColor = topColor === 'w' ? 'b' : 'w';
    const opponentBottomPieceColor = bottomColor === 'w' ? 'b' : 'w';

    renderCapturedTray(DOM.topCapturedTray, topCaptures, opponentTopPieceColor);
    renderCapturedTray(DOM.bottomCapturedTray, bottomCaptures, opponentBottomPieceColor);

    // Render lead badges
    if (lead > 0) {
      // White leads
      if (topColor === 'w') {
        DOM.topMaterialLead.textContent = `+${lead}`;
        DOM.topMaterialLead.classList.add('visible');
        DOM.bottomMaterialLead.classList.remove('visible');
      } else {
        DOM.bottomMaterialLead.textContent = `+${lead}`;
        DOM.bottomMaterialLead.classList.add('visible');
        DOM.topMaterialLead.classList.remove('visible');
      }
    } else if (lead < 0) {
      // Black leads
      const absLead = Math.abs(lead);
      if (topColor === 'b') {
        DOM.topMaterialLead.textContent = `+${absLead}`;
        DOM.topMaterialLead.classList.add('visible');
        DOM.bottomMaterialLead.classList.remove('visible');
      } else {
        DOM.bottomMaterialLead.textContent = `+${absLead}`;
        DOM.bottomMaterialLead.classList.add('visible');
        DOM.topMaterialLead.classList.remove('visible');
      }
    } else {
      DOM.topMaterialLead.classList.remove('visible');
      DOM.bottomMaterialLead.classList.remove('visible');
    }
  }

  function renderCapturedTray(trayEl, pieceTypes, pieceColor) {
    trayEl.innerHTML = '';
    if (pieceTypes.length === 0) return;

    // Group pieces by type: 'p', 'n', 'b', 'r', 'q'
    const counts = {};
    const order = ['q', 'r', 'b', 'n', 'p'];
    pieceTypes.forEach((t) => {
      counts[t] = (counts[t] || 0) + 1;
    });

    order.forEach((type) => {
      if (counts[type]) {
        const group = document.createElement('span');
        group.className = 'captured-group';

        const img = document.createElement('img');
        img.src = `assets/pieces/${pieceColor}${type.toUpperCase()}.svg`;
        img.className = 'captured-piece-icon';
        img.alt = type;
        group.appendChild(img);

        if (counts[type] > 1) {
          const countSpan = document.createElement('span');
          countSpan.className = 'captured-count';
          countSpan.textContent = `×${counts[type]}`;
          group.appendChild(countSpan);
        }

        trayEl.appendChild(group);
      }
    });
  }

  // ==================== MOVE HISTORY PANEL ====================
  function updateMoveHistoryTable() {
    const history = State.game.history();
    if (history.length === 0) {
      DOM.historyBody.innerHTML = `
        <tr class="history-empty-row">
          <td colspan="3">Moves will appear here...</td>
        </tr>`;
      return;
    }

    DOM.historyBody.innerHTML = '';

    for (let i = 0; i < history.length; i += 2) {
      const moveNumber = Math.floor(i / 2) + 1;
      const whiteMove = history[i];
      const blackMove = history[i + 1] || '';

      const tr = document.createElement('tr');

      const tdNum = document.createElement('td');
      tdNum.className = 'td-num';
      tdNum.textContent = `${moveNumber}.`;

      const tdWhite = document.createElement('td');
      tdWhite.className = 'th-move';
      const spanWhite = document.createElement('span');
      spanWhite.className = 'move-cell';
      spanWhite.textContent = whiteMove;
      if (i === history.length - 1) spanWhite.classList.add('current-move');
      tdWhite.appendChild(spanWhite);

      const tdBlack = document.createElement('td');
      tdBlack.className = 'th-move';
      if (blackMove) {
        const spanBlack = document.createElement('span');
        spanBlack.className = 'move-cell';
        spanBlack.textContent = blackMove;
        if (i + 1 === history.length - 1) spanBlack.classList.add('current-move');
        tdBlack.appendChild(spanBlack);
      }

      tr.appendChild(tdNum);
      tr.appendChild(tdWhite);
      tr.appendChild(tdBlack);
      DOM.historyBody.appendChild(tr);
    }

    // Auto-scroll to latest move
    DOM.historyContainer.scrollTop = DOM.historyContainer.scrollHeight;
  }

  // ==================== CONTROLS ACTIONS ====================
  function undoMove() {
    if (State.isGameOver) {
      showToast('Cannot undo after match has ended.');
      return;
    }

    const undone = State.game.undo();
    if (!undone) {
      showToast('No moves to undo.');
      return;
    }

    // Invert last move if autoFlip was on
    if (State.autoFlip) {
      State.boardOrientation = State.boardOrientation === 'w' ? 'b' : 'w';
    }

    // Update lastMove from remaining history
    const history = State.game.history({ verbose: true });
    if (history.length > 0) {
      const prev = history[history.length - 1];
      State.lastMove = { from: prev.from, to: prev.to };
    } else {
      State.lastMove = null;
    }

    State.selectedSquare = null;
    State.legalMovesForSelected = [];
    SoundEngine.playMove();

    renderBoard();
    updateUI();
    showToast(`Undone move ${undone.san}`);
  }

  function toggleBoardOrientation() {
    State.boardOrientation = State.boardOrientation === 'w' ? 'b' : 'w';
    renderBoard();
    updateUI();
    showToast(`Perspective: ${State.boardOrientation === 'w' ? 'White' : 'Black'} at bottom`);
  }

  function promptRestartGame() {
    showConfirmModal({
      icon: '🔄',
      title: 'Restart Match?',
      text: 'Are you sure you want to restart the current game? All moves will be reset.',
      confirmBtnText: 'Restart',
      onConfirm: () => {
        resetGame();
        showToast('Game has been reset.');
      }
    });
  }

  function promptResign() {
    if (State.isGameOver) return;
    const currentTurn = State.game.turn();
    const resigningPlayer = currentTurn === 'w' ? 'Player 1 (White)' : 'Player 2 (Black)';
    const winningPlayer = currentTurn === 'w' ? 'Player 2 (Black)' : 'Player 1 (White)';

    showConfirmModal({
      icon: '🏳️',
      title: 'Resign Match?',
      text: `${resigningPlayer}, are you sure you want to resign? Victory will be awarded to ${winningPlayer}.`,
      confirmBtnText: 'Resign',
      onConfirm: () => {
        State.isGameOver = true;
        stopClockTimer();
        State.gameOverReason = `${resigningPlayer} resigned. ${winningPlayer} wins!`;

        SoundEngine.playGameOver(false);
        showGameOverModal({
          title: 'Resignation',
          subtitle: `${resigningPlayer} resigned. ${winningPlayer} wins!`,
          result: currentTurn === 'w' ? '0 - 1' : '1 - 0',
          reason: 'Resignation',
          trophy: '🏳️'
        });
      }
    });
  }

  function promptOfferDraw() {
    if (State.isGameOver) return;
    const currentTurn = State.game.turn();
    const offeringPlayer = currentTurn === 'w' ? 'Player 1 (White)' : 'Player 2 (Black)';
    const respondingPlayer = currentTurn === 'w' ? 'Player 2 (Black)' : 'Player 1 (White)';

    DOM.drawOfferText.textContent = `${offeringPlayer} has offered a draw. ${respondingPlayer}, do you accept?`;
    DOM.modalDrawOffer.classList.remove('hidden');

    DOM.btnAcceptDraw.onclick = () => {
      DOM.modalDrawOffer.classList.add('hidden');
      State.isGameOver = true;
      stopClockTimer();
      State.gameOverReason = 'Match drawn by mutual agreement.';

      SoundEngine.playGameOver(false);
      showGameOverModal({
        title: 'Draw — Mutual Agreement',
        subtitle: 'Both players agreed to a draw.',
        result: '½ - ½',
        reason: 'Mutual Agreement',
        trophy: '🤝'
      });
    };

    DOM.btnDeclineDraw.onclick = () => {
      DOM.modalDrawOffer.classList.add('hidden');
      showToast(`${respondingPlayer} declined the draw offer.`);
    };
  }

  function showConfirmModal({ icon, title, text, confirmBtnText, onConfirm }) {
    DOM.confirmIcon.textContent = icon || '⚠️';
    DOM.confirmTitle.textContent = title;
    DOM.confirmText.textContent = text;
    DOM.btnConfirmYes.textContent = confirmBtnText || 'Confirm';
    DOM.modalConfirm.classList.remove('hidden');

    DOM.btnConfirmYes.onclick = () => {
      DOM.modalConfirm.classList.add('hidden');
      if (typeof onConfirm === 'function') onConfirm();
    };

    DOM.btnConfirmNo.onclick = () => {
      DOM.modalConfirm.classList.add('hidden');
    };
  }

  // ==================== PGN EXPORT & CLIPBOARD ====================
  function copyPgnToClipboard() {
    const pgn = State.game.pgn();
    if (!pgn) {
      showToast('No moves made yet.');
      return;
    }
    navigator.clipboard.writeText(pgn).then(
      () => showToast('📋 PGN copied to clipboard!'),
      () => showToast('Failed to copy PGN.')
    );
  }

  function downloadPgnFile() {
    const pgn = State.game.pgn();
    if (!pgn) {
      showToast('No moves made yet.');
      return;
    }
    const blob = new Blob([pgn], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `chess_arena_${new Date().toISOString().slice(0, 10)}.pgn`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('💾 PGN file downloaded!');
  }

  // ==================== SETTINGS (THEME & SOUND) ====================
  function toggleSound() {
    State.soundMuted = !State.soundMuted;
    SoundEngine.setMuted(State.soundMuted);
    localStorage.setItem('chess_arena_muted', State.soundMuted);
    updateSoundIcons();
    showToast(State.soundMuted ? '🔇 Sound Muted' : '🔊 Sound Enabled');
  }

  function updateSoundIcons() {
    if (State.soundMuted) {
      DOM.iconSoundOn.classList.add('hidden');
      DOM.iconSoundOff.classList.remove('hidden');
    } else {
      DOM.iconSoundOn.classList.remove('hidden');
      DOM.iconSoundOff.classList.add('hidden');
    }
  }

  function setTheme(theme) {
    State.currentTheme = theme;
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('chess_arena_theme', theme);
  }

  // ==================== KEYBOARD SHORTCUTS ====================
  function handleKeyboardShortcuts(e) {
    // If a modal is open, Escape closes it
    if (e.key === 'Escape') {
      if (!DOM.modalPromotion.classList.contains('hidden')) {
        // Promotion cannot be casually escaped without move cancellation
        DOM.modalPromotion.classList.add('hidden');
        State.pendingPromotion = null;
        deselectSquare();
        return;
      }
      DOM.modalWelcome.classList.add('hidden');
      DOM.modalDrawOffer.classList.add('hidden');
      DOM.modalConfirm.classList.add('hidden');
      DOM.modalGameOver.classList.add('hidden');
      DOM.modalRules.classList.add('hidden');
      return;
    }

    // Ctrl+Z to undo
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undoMove();
    }

    // 'f' to flip board
    if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.altKey && !e.target.matches('input, select')) {
      toggleBoardOrientation();
    }
  }

  // ==================== TOAST SYSTEM ====================
  function showToast(message, duration = 3000) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    DOM.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, duration);
  }

  function getPieceFullName(type) {
    const names = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' };
    return names[type.toLowerCase()] || 'Piece';
  }

  // ==================== APPLICATION BOOTSTRAP ====================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
