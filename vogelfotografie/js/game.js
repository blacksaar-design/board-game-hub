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

    // Bot
    addBotBtn: document.getElementById('addBotBtn')
};

// Internal client state
let isPhotoPending = false;

// Event Listeners - Lobby
if (elements.addBotBtn) {
    elements.addBotBtn.addEventListener('click', () => {
        socket.emit('addBot', {}, (response) => {
            if (!response.success) {
                UI.showModal('❌', 'Fehler', response.error);
            }
        });
    });
}

elements.createRoomBtn.addEventListener('click', () => {
    const playerName = elements.createPlayerName.value.trim();
    if (!playerName) {
        UI.showModal('⚠️', 'Name vergessen', 'Bitte gib deinen Namen ein');
        return;
    }

    if (elements.addBotBtn) elements.addBotBtn.style.display = 'block';

    socket.emit('createRoom', playerName, (response) => {
        if (response.success) {
            gameState.playerId = response.playerId;
            gameState.playerName = playerName;
            gameState.roomCode = response.roomCode;
            elements.displayRoomCode.textContent = response.roomCode;

            // Force show Bot button for Host
            if (elements.addBotBtn) elements.addBotBtn.style.display = 'block';

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

    if (elements.addBotBtn) elements.addBotBtn.style.display = 'none';

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
    socket.emit('startGame', (response) => {
        if (!response.success) {
            UI.showModal('❌', 'Fehler', response.error);
        }
    });
});

// Event Listeners - Game Actions
elements.sneakBtn.addEventListener('click', () => {
    if (!gameState.currentBirdId) return;

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
                UI.showModal('📸', 'Foto gemacht!', 'Du hast den Vogel erfolgreich fotografiert.');
            } else if (response.result === 'scared') {
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

    // Auto-show/hide start button only for host
    const isHost = socket.isHost;
    elements.startGameBtn.style.display = isHost ? 'block' : 'none';

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
    UI.animateDice(elements.dice, data.diceValue, () => {
        if (data.diceValue === 'bird') {
            UI.showModal('🕊️', 'Vogel weg!', 'Der Vogel wurde aufgeschreckt und ist weggeflogen.');
        }
    }, data.skipAnimation);
});

socket.on('diceUpdated', (data) => {
    if (data.playerId !== gameState.playerId) {
        elements.dice.textContent = data.newDice;
    }
});

socket.on('gameEnded', (data) => {
    elements.finalScores.innerHTML = '';
    const winnerId = data.finalScores.reduce((prev, current) => (prev.score > current.score) ? prev : current).playerId;

    data.finalScores.sort((a, b) => b.score - a.score).forEach(player => {
        elements.finalScores.appendChild(UI.createFinalScoreItem(player, player.playerId === winnerId));
    });
    UI.showScreen('endScreen');
});

// Helper Functions
function updateGameState(state) {
    Object.assign(gameState, state);

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

    gameState.currentBirdId = bird.id;

    // Update UI selected state
    document.querySelectorAll('.bird-card').forEach(c => c.classList.remove('selected'));
    const selectedCard = document.querySelector(`.bird-card[data-bird-id="${bird.id}"]`);
    if (selectedCard) selectedCard.classList.add('selected');

    elements.selectedBirdInfo.innerHTML = `
        <h3>${bird.name}</h3>
        <p>${bird.prestige_points} Prestige-Punkte</p>
    `;

    updateActionButtons();
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
