// Main game client for Vogelfotografie - PeerJS Hub Edition
const socket = window.io();
const UI = window.UIComponents;

// Game state
let gameState = {
    roomCode: null,
    playerId: null,
    playerName: null,
    currentBirdId: null,
    currentPlayerIndex: 0,
    playerOrder: 0,
    selectedInsects: [],
    myHand: { insects: [], birds: [] }
};

// DOM Elements
const elements = {
    // Lobby
    createPlayerName: document.getElementById('createPlayerName'),
    createRoomBtn: document.getElementById('createRoomBtn'),
    joinRoomCode: document.getElementById('joinRoomCode'),
    joinPlayerName: document.getElementById('joinPlayerName'),
    joinRoomBtn: document.getElementById('joinRoomBtn'),

    // Waiting Room
    displayRoomCode: document.getElementById('displayRoomCode'),
    playersList: document.getElementById('playersList'),
    playerCount: document.getElementById('playerCount'),
    startGameBtn: document.getElementById('startGameBtn'),
    leaveLobbyBtn: document.getElementById('leaveLobbyBtn'),

    // Game Board
    gameRoomCode: document.getElementById('gameRoomCode'),
    birdDeckCount: document.getElementById('birdDeckCount'),
    insectDeckCount: document.getElementById('insectDeckCount'),
    playersInfo: document.getElementById('playersInfo'),
    turnIndicator: document.getElementById('turnIndicator'),
    currentPlayerName: document.getElementById('currentPlayerName'),
    visibleBirds: document.getElementById('visibleBirds'),
    selectedBirdInfo: document.getElementById('selectedBirdInfo'),
    insectHand: document.getElementById('insectHand'),
    capturedBirds: document.getElementById('capturedBirds'),
    playerScore: document.getElementById('playerScore'),

    // Actions
    sneakBtn: document.getElementById('sneakBtn'),
    photoBtn: document.getElementById('photoBtn'),
    confirmBtn: document.getElementById('confirmBtn'),
    applyBonusBtn: document.getElementById('applyBonusBtn'),
    captureAllBtn: document.getElementById('captureAllBtn'),
    attractBtn: document.getElementById('attractBtn'),
    diceArea: document.getElementById('diceArea'),
    dice: document.getElementById('dice'),

    // End screen
    winnerText: document.getElementById('winnerText'),
    finalScores: document.getElementById('finalScores'),
    newGameBtn: document.getElementById('newGameBtn'),

    // Modal
    modalClose: document.getElementById('modalClose'),

    // Photos Toggle
    togglePhotos: document.getElementById('togglePhotos'),

    // Debug
    boostBtn: document.getElementById('boostBtn'),

    // Game Log
    gameLog: document.getElementById('gameLog')
};

// Internal client state
let isPhotoPending = false;

// Event Listeners - Lobby

elements.createRoomBtn.addEventListener('click', () => {
    const playerName = elements.createPlayerName.value.trim();
    if (!playerName) {
        UI.showModal('⚠️', 'Name vergessen', 'Bitte gib deinen Namen ein');
        return;
    }

    socket.emit('createRoom', playerName, (response) => {
        if (response.success) {
            gameState.playerId = response.playerId;
            gameState.playerName = playerName;
            gameState.roomCode = response.roomCode;
            elements.displayRoomCode.textContent = response.roomCode;

            const debugOpts = document.getElementById('debugOptions');
            if (debugOpts) debugOpts.style.display = 'block';
            const rulesEl = document.getElementById('rulesSelection');
            if (rulesEl) rulesEl.style.display = 'block';

            UI.showScreen('waitingScreen');
        } else {
            UI.showModal('❌', 'Fehler', response.error);
        }
    });
});

elements.joinRoomBtn.addEventListener('click', () => {
    const roomCode = elements.joinRoomCode.value.trim().toUpperCase();
    const playerName = elements.joinPlayerName.value.trim();

    if (!roomCode || !playerName) {
        UI.showModal('⚠️', 'Eingabe unvollständig', 'Bitte gib einen Raum-Code und deinen Namen ein');
        return;
    }

    socket.emit('joinRoom', { roomCode, playerName }, (response) => {
        if (response.success) {
            gameState.playerId = response.playerId;
            gameState.playerName = playerName;
            gameState.roomCode = roomCode;
            elements.displayRoomCode.textContent = roomCode;
            UI.showScreen('waitingScreen');
        } else {
            UI.showModal('❌', 'Fehler', response.error);
        }
    });
});

elements.leaveLobbyBtn.addEventListener('click', () => {
    location.reload();
});

elements.startGameBtn.addEventListener('click', () => {
    const npcOnlyCb = document.getElementById('npcOnlyMode');
    const spectatorMode = npcOnlyCb ? npcOnlyCb.checked : false;
    const automaModeCombo = document.getElementById('automaMode');
    let automaMode = automaModeCombo ? automaModeCombo.value : 'none';

    const easyAutomaCb = document.getElementById('easyAutomaMode');
    if (easyAutomaCb && easyAutomaCb.checked && automaMode !== 'none') {
        automaMode = 'easy';
    }

    socket.emit('startGame', { spectatorMode, automaMode }, (response) => {
        if (!response.success) {
            UI.showModal('❌', 'Fehler', response.error);
        } else if (spectatorMode && elements.boostBtn) {
            elements.boostBtn.style.display = 'inline-block';
        }
    });
});

const startChallengeBtn = document.getElementById('startChallengeBtn');
if (startChallengeBtn) {
    if (window.Challenge && window.Challenge.Manager.active) {
        startChallengeBtn.innerHTML = `🏆 Herausforderung fortsetzen (Runde ${window.Challenge.Manager.completedGoalIds.length + 1}/4) 🏆`;
        startChallengeBtn.style.background = 'linear-gradient(135deg, #10B981, #059669)';
        startChallengeBtn.style.color = '#fff';
    }

    startChallengeBtn.addEventListener('click', () => {
        const automaModeCombo = document.getElementById('automaMode');
        const automaMode = automaModeCombo ? automaModeCombo.value : 'master';

        if (automaMode === 'none') {
            UI.showModal('⚠️', 'Kein Automa ausgewählt', 'Bitte wähle im Dropdown-Menü darüber einen Automa-Schwierigkeitsgrad (Lehrer oder Meister) aus, gegen den du in der Herausforderung antreten willst.');
            return;
        }

        if (!window.Challenge.Manager.active) {
            window.Challenge.Manager.start();
        }
        socket.emit('startGame', { spectatorMode: false, automaMode: automaMode, isChallenge: true }, (response) => {
            if (!response.success) {
                UI.showModal('❌', 'Fehler', response.error);
                window.Challenge.Manager.abort();
            }
        });
    });
}

if (elements.boostBtn) {
    elements.boostBtn.addEventListener('click', () => {
        window.botSpeedBoost = !window.botSpeedBoost;
        elements.boostBtn.classList.toggle('btn-primary', window.botSpeedBoost);
        elements.boostBtn.classList.toggle('btn-secondary', !window.botSpeedBoost);
        if (window.botSpeedBoost && window.localHost) {
            window.localHost.botDelay = 50;
        } else if (window.localHost) {
            window.localHost.botDelay = 1500;
        }
    });
}

if (elements.newGameBtn) {
    elements.newGameBtn.addEventListener('click', () => {
        location.reload();
    });
}

// Event Listeners - Game Actions
elements.sneakBtn.addEventListener('click', () => {
    if (!gameState.currentBirdId) return;

    if (window.Sounds) window.Sounds.playSneak();

    const useInsect = gameState.selectedInsects.length > 0;
    const insectId = useInsect ? gameState.selectedInsects[0] : null;

    socket.emit('sneak', { birdId: gameState.currentBirdId, useInsect, insectId }, (response) => {
        if (response.success) {
            gameState.selectedInsects = [];
            requestHandUpdate();
        }
    });
});

elements.photoBtn.addEventListener('click', () => {
    if (!gameState.currentBirdId) return;

    if (window.Sounds) window.Sounds.playPhotoClick();

    socket.emit('startPhotoRoll', { birdId: gameState.currentBirdId }, (response) => {
        if (response.success) {
            isPhotoPending = true;
            // Animation is now handled by diceRolled broadcast
            requestHandUpdate();
        }
    });
});

elements.applyBonusBtn.addEventListener('click', () => {
    if (gameState.selectedInsects.length === 0) return;

    if (window.Sounds) window.Sounds.playInsectBonus();

    socket.emit('applyBonusToPhoto', gameState.selectedInsects[0], (response) => {
        if (response.success) {
            gameState.selectedInsects = [];
            elements.dice.textContent = response.newDice;
            updateActionButtons();
            requestHandUpdate();
        }
    });
});

elements.confirmBtn.addEventListener('click', () => {
    socket.emit('resolvePhoto', (response) => {
        if (response.success) {
            isPhotoPending = false;
            if (response.result === 'captured') {
                if (window.Sounds) window.Sounds.playCaptureSuccess();
                UI.showModal('📸', 'Foto gemacht!', 'Du hast den Vogel erfolgreich fotografiert.');
            } else if (response.result === 'scared') {
                if (window.Sounds) window.Sounds.playFail();
                UI.showModal('💨', 'Vogel weg!', 'Das Foto ist leider nichts geworden und der Vogel ist weg.');
            }
            gameState.selectedInsects = [];
            requestHandUpdate();
        }
    });
});

elements.attractBtn.addEventListener('click', () => {
    if (!gameState.currentBirdId || gameState.selectedInsects.length !== 2) return;

    socket.emit('attract', { birdId: gameState.currentBirdId, insectIds: gameState.selectedInsects }, (response) => {
        if (response.success) {
            if (window.Sounds) window.Sounds.playAttract();
            UI.showModal('✨', 'Vogel angelockt!', 'Du hast den Vogel mit deinen Insekten angelockt.');
            gameState.selectedInsects = [];
            requestHandUpdate();
        }
    });
});

elements.captureAllBtn.addEventListener('click', () => {
    if (gameState.selectedInsects.length !== 3) return;

    socket.emit('captureAll', { insectIds: gameState.selectedInsects }, (response) => {
        if (response.success) {
            isPhotoPending = false;
            if (window.Sounds) window.Sounds.playMegaCapture();
            UI.showModal('📸✨', 'Mega-Foto!', `Du hast ${response.count} Vögel gleichzeitig fotografiert!`);
            gameState.selectedInsects = [];
            requestHandUpdate();
        } else {
            UI.showModal('❌', 'Fehler', response.error);
        }
    });
});

elements.modalClose.addEventListener('click', () => {
    UI.hideModal();
});

elements.togglePhotos.addEventListener('click', () => {
    const container = elements.capturedBirds;
    const header = elements.togglePhotos;
    const isCollapsed = container.classList.toggle('collapsed');
    header.classList.toggle('expanded', !isCollapsed);
});

// Socket Event Handlers
socket.on('playerListUpdate', (players) => {
    elements.playersList.innerHTML = '';
    players.forEach((player, index) => {
        elements.playersList.appendChild(UI.createPlayerItem(player, index));
    });
    elements.playerCount.textContent = players.length;

    // Auto-show/hide start button and rules only for host
    const isHost = socket.isHost;
    elements.startGameBtn.style.display = isHost ? 'block' : 'none';
    const rulesSelection = document.getElementById('rulesSelection');
    if (rulesSelection) rulesSelection.style.display = isHost ? 'block' : 'none';

    // Force Bot Button Logic
    if (isHost) {
        ensureBotButton();
    } else {
        const container = document.getElementById('botControls');
        if (container) container.style.display = 'none';

        // Legacy cleanup
        const oldBtn = document.getElementById('addBotBtn');
        if (oldBtn && !container) oldBtn.style.display = 'none';
    }
});

function ensureBotButton() {
    let container = document.getElementById('botControls');

    if (!container) {
        // Create container
        container = document.createElement('div');
        container.id = 'botControls';
        container.style.display = 'flex';
        container.style.gap = '5px';
        container.style.marginBottom = '10px';

        // Difficulty Select
        const select = document.createElement('select');
        select.id = 'botDifficultyGroup';
        select.className = 'btn btn-secondary'; // Recycle style
        select.style.flex = '1';
        select.style.textAlign = 'center';
        select.style.padding = '0 5px';
        select.innerHTML = `
            <option value="easy">🤖 Leicht</option>
            <option value="medium">🧠 Mittel</option>
            <option value="hard">🏆 Profi</option>
            <option value="legendary">🦄 Legendär</option>
        `;

        // Add Button
        const btn = document.createElement('button');
        btn.id = 'addBotBtn';
        btn.className = 'btn btn-secondary';
        btn.style.flex = '0 0 auto';
        btn.innerHTML = '+';

        container.appendChild(select);
        container.appendChild(btn);

        // Find insertion point
        const startGameBtn = document.getElementById('startGameBtn');
        const playersList = document.querySelector('.players-waiting');

        if (playersList) {
            playersList.appendChild(container);

            // Listener
            btn.addEventListener('click', () => {
                const difficulty = select.value;
                socket.emit('addBot', { difficulty }, (response) => {
                    if (!response.success) {
                        UI.showModal('❌', 'Fehler', response.error);
                    }
                });
            });
        }
    }

    if (container) container.style.display = 'flex';
}

socket.on('gameStarted', (state) => {
    updateGameState(state);
    UI.showScreen('gameScreen');
    requestHandUpdate();
});

socket.on('gameStateUpdate', (state) => {
    updateGameState(state);
    requestHandUpdate();
});

socket.on('diceRolled', (data) => {
    if (!data.skipAnimation && window.Sounds) window.Sounds.playDiceRoll();
    UI.animateDice(elements.dice, data.diceValue, () => {
        if (data.diceValue === 'bird') {
            if (window.Sounds) window.Sounds.playFail();
            UI.showModal('🕊️', 'Vogel weg!', 'Der Vogel wurde aufgeschreckt und ist weggeflogen.');
        }
    }, data.skipAnimation);
});

socket.on('diceUpdated', (data) => {
    if (data.playerId !== gameState.playerId) {
        elements.dice.textContent = data.newDice;
    }
});

socket.on('logUpdate', (entry) => {
    if (!elements.gameLog) return;

    const div = document.createElement('div');
    div.className = `log-entry ${entry.type}`;
    div.innerHTML = `<small style="opacity: 0.5; font-size: 0.7rem;">[${entry.timestamp}]</small> ${entry.message}`;

    elements.gameLog.appendChild(div);
    elements.gameLog.scrollTop = elements.gameLog.scrollHeight;
});

socket.on('gameEnded', (data) => {
    elements.finalScores.innerHTML = '';
    const winnerId = data.finalScores.reduce((prev, current) => (prev.score > current.score) ? prev : current).playerId;

    if (window.Sounds) window.Sounds.playGameEnd();
    data.finalScores.sort((a, b) => b.score - a.score).forEach(player => {
        elements.finalScores.appendChild(UI.createFinalScoreItem(player, player.playerId === winnerId));
    });

    if (window.Challenge && window.Challenge.Manager.active) {
        handleChallengeEval(data.finalScores);
    } else {
        UI.showScreen('endScreen');
    }
});

function handleChallengeEval(finalScores) {
    const mgr = window.Challenge.Manager;
    const { metGoals, beatAutoma } = mgr.evaluateGame(finalScores);

    if (!beatAutoma) {
        showChallengeOverlay('Niederlage!', 'Du konntest den Automa in diesem Spiel nicht schlagen. Die Herausforderung ist gescheitert.');
        mgr.abort();
    } else if (metGoals.length === 0) {
        showChallengeOverlay('Kein Ziel erreicht!', 'Du hast zwar gewonnen, aber keines der verbleibenden Ziele erfüllt. Die Herausforderung ist gescheitert.');
        mgr.abort();
    } else if (metGoals.length === 1) {
        // Automatically check off that goal
        mgr.completeGoal(metGoals[0].id);
        if (mgr.isComplete()) {
            showChallengeOverlay('🏆 LEGENDÄR 🏆', 'DU HAST 4 SPIELE IN FOLGE GEWONNEN UND ALLE ZIELE ERFÜLLT! Du bist der König der Vogelfotografie!');
            mgr.abort(); // Reset after winning the whole thing
        } else {
            showChallengeOverlay('🎯 Ziel erreicht!', `Du hast das Ziel "${metGoals[0].title}" erfolgreich gemeistert! Deine Herausforderung geht in die nächste Runde.`);
        }
    } else {
        // Need to choose a goal
        showGoalSelection(metGoals, () => {
            if (mgr.isComplete()) {
                showChallengeOverlay('🏆 LEGENDÄR 🏆', 'DU HAST 4 SPIELE IN FOLGE GEWONNEN UND ALLE ZIELE ERFÜLLT! Du bist der König der Vogelfotografie!');
                mgr.abort(); // Reset after winning the whole thing
            } else {
                showChallengeOverlay('✅ Auswahl bestätigt!', 'Dein Fortschritt wurde gespeichert. Die Herausforderung geht weiter.');
            }
        });
    }
}

function showChallengeOverlay(title, text) {
    document.getElementById('challengeOverlayTitle').textContent = title;
    document.getElementById('challengeOverlayText').textContent = text;
    document.getElementById('challengeOverlaySlots').innerHTML = ''; // maybe show past progress?
    const overlay = document.getElementById('challengeOverlay');
    overlay.style.display = 'flex';

    document.getElementById('challengeOverlayCloseBtn').onclick = () => {
        overlay.style.display = 'none';
        UI.showScreen('endScreen');
    };
}

function showGoalSelection(goals, onComplete) {
    const list = document.getElementById('goalSelectionList');
    list.innerHTML = '';

    goals.forEach(g => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-secondary';
        btn.style.textAlign = 'left';
        btn.innerHTML = `<span style="font-size:1.5rem">${g.icon}</span> <b>${g.title}</b><br><small>${g.description}</small>`;
        btn.onclick = () => {
            window.Challenge.Manager.completeGoal(g.id);
            document.getElementById('goalSelectionModal').style.display = 'none';
            onComplete();
        };
        list.appendChild(btn);
    });

    document.getElementById('goalSelectionModal').style.display = 'flex';
}

// Helper Functions
function updateGameState(state) {
    const prevPlayerIndex = gameState.currentPlayerIndex;
    Object.assign(gameState, state);

    if (window.Challenge && window.Challenge.Manager.active) {
        updateChallengeBanner();
    } else {
        const banner = document.getElementById('challengeBanner');
        if (banner) banner.style.display = 'none';
    }

    // Play new-turn sound when the active player changes
    if (typeof prevPlayerIndex === 'number' && state.currentPlayerIndex !== prevPlayerIndex) {
        if (window.Sounds) window.Sounds.playNewTurn();
    }

    elements.gameRoomCode.textContent = gameState.roomCode;
    elements.birdDeckCount.textContent = state.birdDeckCount;
    elements.insectDeckCount.textContent = state.insectDeckCount;

    const currentPlayer = state.players[state.currentPlayerIndex];
    elements.currentPlayerName.textContent = currentPlayer.playerName;

    // Update player cards
    elements.playersInfo.innerHTML = '';
    state.players.forEach((player, index) => {
        elements.playersInfo.appendChild(UI.createPlayerCard(player, index === state.currentPlayerIndex));
    });

    // Update birds
    elements.visibleBirds.innerHTML = '';
    state.visibleBirds.forEach(bird => {
        const card = UI.createBirdCard(bird);
        if (bird.id === gameState.currentBirdId) card.classList.add('selected');
        card.addEventListener('click', () => selectBird(bird));
        elements.visibleBirds.appendChild(card);
    });

    UI.updateDistanceTracker(state.currentDistance);

    if (!state.currentBirdId) {
        elements.selectedBirdInfo.innerHTML = '<p>Wähle einen Vogel zum Fotografieren aus</p>';
    }

    updateActionButtons();
}

function selectBird(bird) {
    if (gameState.players[gameState.currentPlayerIndex].playerId !== gameState.playerId) return;
    if (isPhotoPending) return;

    // Lock check: Once selected, cannot be changed
    if (gameState.currentBirdId && gameState.currentBirdId !== bird.id) {
        UI.showModal('🔒', 'Gesperrt', 'Du hast bereits ein Ziel gewählt und kannst es in diesem Zug nicht mehr ändern.');
        return;
    }

    if (gameState.currentBirdId === bird.id) return;

    if (window.Sounds) window.Sounds.playSelectBird();

    socket.emit('selectBird', { birdId: bird.id }, (response) => {
        if (!response.success) {
            UI.showModal('❌', 'Fehler', response.error);
        } else {
            gameState.currentBirdId = bird.id;
            updateActionButtons();
        }
    });
}

function requestHandUpdate() {
    socket.emit('getHand', null, (hand) => {
        gameState.myHand = hand;
        updateHandDisplay();
    });
}

function updateHandDisplay() {
    elements.insectHand.innerHTML = '';
    gameState.myHand.insects.forEach(insect => {
        const card = UI.createInsectCard(insect);
        if (gameState.selectedInsects.includes(insect.id)) {
            card.classList.add('selected');
        }
        card.addEventListener('click', () => {
            toggleInsectSelection(insect.id, card);
        });
        elements.insectHand.appendChild(card);
    });

    elements.capturedBirds.innerHTML = '';
    gameState.myHand.birds.forEach(bird => {
        const card = UI.createBirdCard(bird, false);
        card.classList.add('captured-photo');
        elements.capturedBirds.appendChild(card);
    });

    const score = gameState.myHand.birds.reduce((sum, b) => sum + b.prestige_points, 0);
    elements.playerScore.textContent = `${score} Pkt`;

    // Refresh button states after hand update
    updateActionButtons();
}

function toggleInsectSelection(insectId, cardElement) {
    const index = gameState.selectedInsects.indexOf(insectId);
    if (index === -1) {
        gameState.selectedInsects.push(insectId);
        cardElement.classList.add('selected');
    } else {
        gameState.selectedInsects.splice(index, 1);
        cardElement.classList.remove('selected');
    }
    updateActionButtons();
}

function updateActionButtons() {
    const isMyTurn = gameState.players && gameState.players[gameState.currentPlayerIndex].playerId === gameState.playerId;
    const hasBird = !!gameState.currentBirdId;
    const numInsects = gameState.selectedInsects.length;

    // Standard actions
    elements.sneakBtn.disabled = !isMyTurn || !hasBird || isPhotoPending;
    elements.photoBtn.disabled = !isMyTurn || !hasBird || isPhotoPending;
    elements.attractBtn.disabled = !isMyTurn || !hasBird || numInsects !== 2 || isPhotoPending;

    // Photo pending actions
    elements.confirmBtn.style.display = isPhotoPending && isMyTurn ? 'block' : 'none';
    elements.confirmBtn.disabled = !isMyTurn || !isPhotoPending;

    elements.applyBonusBtn.style.display = isPhotoPending && isMyTurn ? 'block' : 'none';
    elements.applyBonusBtn.disabled = !isMyTurn || !isPhotoPending || numInsects !== 1;

    // Check for 3 matching insects for captureAll
    let canCaptureAll = false;
    let captureCount = 0;
    if (isPhotoPending && isMyTurn && numInsects === 3) {
        const selectedInsects = gameState.myHand.insects.filter(i => gameState.selectedInsects.includes(i.id));
        const firstType = selectedInsects[0]?.card_type;
        const allSameType = selectedInsects.every(i => i.card_type === firstType);

        if (allSameType) {
            // Count eligible birds using our new utility
            gameState.visibleBirds.forEach(bird => {
                const diceValue = parseInt(elements.dice.textContent); // Current dice value from UI
                if (UI.checkPhotoSuccess(diceValue, bird, gameState.currentDistance)) {
                    captureCount++;
                }
            });
            canCaptureAll = captureCount > 0;
        }
    }

    elements.captureAllBtn.style.display = canCaptureAll ? 'block' : 'none';
    elements.captureAllBtn.disabled = !canCaptureAll;
    if (canCaptureAll) {
        elements.captureAllBtn.innerHTML = `<span class="btn-icon">📸✨</span> ${captureCount} Vögel fangen`;
    }

    // Attract button visibility (optional, but keep consistent)
    elements.attractBtn.style.display = !isPhotoPending && isMyTurn ? 'block' : 'none';
}

// Initial status
const dot = document.getElementById('statusDot');
if (dot) dot.style.background = '#FFB84D';

// Sound Toggle
const soundToggleBtn = document.getElementById('soundToggleBtn');
if (soundToggleBtn) {
    soundToggleBtn.addEventListener('click', () => {
        if (window.Sounds) {
            window.Sounds.enabled = !window.Sounds.enabled;
            soundToggleBtn.textContent = window.Sounds.enabled ? '🔊' : '🔇';
        }
    });
}

function updateChallengeBanner() {
    const banner = document.getElementById('challengeBanner');
    const slotsObj = document.getElementById('challengeSlots');
    if (!banner || !slotsObj || !window.Challenge) return;

    banner.style.display = 'flex';
    slotsObj.innerHTML = '';

    const mgr = window.Challenge.Manager;
    const completedCount = mgr.completedGoalIds.length;

    for (let i = 0; i < 4; i++) {
        const slot = document.createElement('div');
        slot.style.width = '24px';
        slot.style.height = '24px';
        slot.style.borderRadius = '50%';
        slot.style.border = '2px solid #FFB84D';
        slot.style.display = 'flex';
        slot.style.alignItems = 'center';
        slot.style.justifyContent = 'center';
        slot.style.fontSize = '0.7rem';
        slot.style.fontWeight = '700';
        slot.style.color = '#fff';

        if (i < completedCount) {
            // Completed
            slot.style.background = '#FFB84D';
            slot.style.color = '#111';
            slot.textContent = '✓';
        } else if (i === completedCount) {
            // Current
            slot.style.background = 'rgba(255, 184, 77, 0.2)';
            slot.textContent = (i + 1).toString();
        } else {
            // Future
            slot.style.background = 'transparent';
            slot.style.borderColor = '#555';
            slot.style.color = '#555';
            slot.textContent = (i + 1).toString();
        }

        slotsObj.appendChild(slot);
    }
}
