// Main game client for Vogelfotografie
const socket = io({
    path: window.location.pathname.replace(/\/$/, '') + '/socket.io'
});
const UI = window.UIComponents;

// Connection Status
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');

socket.on('connect', () => {
    statusDot.classList.add('connected');
    statusText.textContent = 'Verbunden';
    console.log('✅ Socket connected:', socket.id);
});

socket.on('disconnect', () => {
    statusDot.classList.remove('connected');
    statusText.textContent = 'Getrennt';
    console.log('❌ Socket disconnected');
});

socket.on('connect_error', (err) => {
    statusDot.classList.remove('connected');
    statusText.textContent = 'Verbindungsfehler';
    console.error('❌ Socket connection error:', err);
});

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

    // Waiting room
    displayRoomCode: document.getElementById('displayRoomCode'),
    playersList: document.getElementById('playersList'),
    playerCount: document.getElementById('playerCount'),
    startGameBtn: document.getElementById('startGameBtn'),
    leaveLobbyBtn: document.getElementById('leaveLobbyBtn'),

    // Game
    gameRoomCode: document.getElementById('gameRoomCode'),
    birdDeckCount: document.getElementById('birdDeckCount'),
    insectDeckCount: document.getElementById('insectDeckCount'),
    playersInfo: document.getElementById('playersInfo'),
    turnIndicator: document.getElementById('turnIndicator'),
    currentPlayerName: document.getElementById('currentPlayerName'),
    visibleBirds: document.getElementById('visibleBirds'),
    selectedBirdInfo: document.getElementById('selectedBirdInfo'),
    distanceTracker: document.getElementById('distanceTracker'),
    sneakBtn: document.getElementById('sneakBtn'),
    photoBtn: document.getElementById('photoBtn'),
    confirmBtn: document.getElementById('confirmBtn'),
    applyBonusBtn: document.getElementById('applyBonusBtn'),
    captureAllBtn: document.getElementById('captureAllBtn'),
    attractBtn: document.getElementById('attractBtn'),
    diceArea: document.getElementById('diceArea'),
    dice: document.getElementById('dice'),
    insectHand: document.getElementById('insectHand'),
    capturedBirds: document.getElementById('capturedBirds'),
    playerScore: document.getElementById('playerScore'),

    // End screen
    winnerText: document.getElementById('winnerText'),
    finalScores: document.getElementById('finalScores'),
    newGameBtn: document.getElementById('newGameBtn'),

    // Modal
    modalClose: document.getElementById('modalClose')
};

// Internal client state
let isPhotoPending = false;

// Event Listeners - Lobby
elements.createRoomBtn.addEventListener('click', () => {
    const playerName = elements.createPlayerName.value.trim();
    if (!playerName) {
        UI.showModal('⚠️', 'Name erforderlich', 'Bitte gib deinen Namen ein');
        return;
    }

    socket.emit('createRoom', playerName, (response) => {
        if (response.success) {
            gameState.roomCode = response.roomCode;
            gameState.playerId = response.playerId;
            gameState.playerName = playerName;
            gameState.playerOrder = 0; // First player is host

            elements.displayRoomCode.textContent = response.roomCode;
            elements.gameRoomCode.textContent = response.roomCode;
            UI.showScreen('waitingScreen');
        } else {
            UI.showModal('❌', 'Error', response.error);
        }
    });
});

elements.joinRoomBtn.addEventListener('click', () => {
    const roomCode = elements.joinRoomCode.value.trim().toUpperCase();
    const playerName = elements.joinPlayerName.value.trim();

    if (!roomCode || !playerName) {
        UI.showModal('⚠️', 'Fehlende Informationen', 'Bitte gib einen Raum-Code und deinen Namen ein');
        return;
    }

    socket.emit('joinRoom', roomCode, playerName, (response) => {
        if (response.success) {
            gameState.roomCode = roomCode;
            gameState.playerId = response.playerId;
            gameState.playerName = playerName;
            // playerOrder will be set by the gameStarted event

            elements.displayRoomCode.textContent = roomCode;
            elements.gameRoomCode.textContent = roomCode;
            UI.showScreen('waitingScreen');
        } else {
            UI.showModal('❌', 'Error', response.error);
        }
    });
});

// Event Listeners - Waiting Room
elements.startGameBtn.addEventListener('click', () => {
    socket.emit('startGame', (response) => {
        if (!response.success) {
            UI.showModal('❌', 'Error', response.error);
        }
    });
});

elements.leaveLobbyBtn.addEventListener('click', () => {
    location.reload();
});

// Event Listeners - Game Actions
elements.sneakBtn.addEventListener('click', () => {
    if (!gameState.currentBirdId) {
        UI.showModal('⚠️', 'Kein Vogel ausgewählt', 'Bitte wähle zuerst einen Vogel aus');
        return;
    }

    const useInsect = gameState.selectedInsects.length > 0;
    const insectId = useInsect ? gameState.selectedInsects[0] : null;

    socket.emit('sneak', gameState.currentBirdId, useInsect, insectId, (response) => {
        if (response.success) {
            if (useInsect) {
                UI.showModal('✅', 'Garantierter Erfolg!', 'Du hast ein Insekt benutzt, um dich erfolgreich anzuschleichen!');
                UI.updateDistanceTracker(response.newDistance);
                gameState.selectedInsects = [];
                updateActionButtons();
                requestHandUpdate();
            } else {
                UI.animateDice(elements.dice, response.diceResult, () => {
                    if (response.result === 'scared') {
                        UI.showModal('🐦', 'Vogel weggeflogen!', 'Der Vogel wurde aufgeschreckt und ist weggeflogen. Du hast als Trost eine Insektenkarte gezogen.');
                        gameState.currentBirdId = null;
                        updateActionButtons();
                    } else {
                        UI.showModal('✅', 'Erfolg!', 'Du hast dich dem Vogel erfolgreich angenähert!');
                        UI.updateDistanceTracker(response.newDistance);
                    }
                });
            }
        } else {
            UI.showModal('❌', 'Error', response.error);
        }
    });
});

elements.photoBtn.addEventListener('click', () => {
    if (!gameState.currentBirdId) {
        UI.showModal('⚠️', 'Kein Vogel ausgewählt', 'Bitte wähle zuerst einen Vogel aus');
        return;
    }

    socket.emit('startPhotoRoll', gameState.currentBirdId, (response) => {
        if (response.success) {
            UI.animateDice(elements.dice, response.diceValue, () => {
                isPhotoPending = true;
                updateActionButtons();
            });
        } else {
            UI.showModal('❌', 'Error', response.error);
        }
    });
});

elements.confirmBtn.addEventListener('click', () => {
    socket.emit('resolvePhoto', (response) => {
        if (response.success) {
            if (response.result === 'captured') {
                UI.showModal('📸', 'Tolles Foto!', 'Du hast den Vogel erfolgreich fotografiert!');
            } else {
                UI.showModal('😞', 'Foto misslungen', 'Der Vogel ist weggeflogen, bevor du den Auslöser drücken konntest.');
            }

            isPhotoPending = false;
            gameState.currentBirdId = null;
            gameState.selectedInsects = [];
            updateActionButtons();
            requestHandUpdate();
        } else {
            UI.showModal('❌', 'Fehler', response.error);
        }
    });
});

elements.applyBonusBtn.addEventListener('click', () => {
    applySelectedBonuses();
});

elements.captureAllBtn.addEventListener('click', () => {
    socket.emit('resolveCaptureAll', gameState.selectedInsects, (response) => {
        if (response.success) {
            const count = response.capturedCount;
            let message = '';
            if (count === 0) {
                message = 'Leider hat diesmal kein Vogel gepasst. Aber sie sind alle da geblieben!';
            } else if (count === 1) {
                message = 'Immerhin einen Vogel erwischt! Die anderen sind zum Glück nicht weggeflogen.';
            } else if (count === 2) {
                message = 'Klasse! Du hast zwei Vögel auf einmal fotografiert!';
            } else {
                message = 'Meisterleistung! Du hast alle drei Vögel auf einmal fotografiert!';
            }
            UI.showModal('📸✨', count > 0 ? 'Guter Fang!' : 'Knapp daneben!', message);
            isPhotoPending = false;
            gameState.currentBirdId = null;
            gameState.selectedInsects = [];
            updateActionButtons();
            requestHandUpdate();
        } else {
            UI.showModal('❌', 'Fehler', response.error);
        }
    });
});

elements.attractBtn.addEventListener('click', () => {
    if (!gameState.currentBirdId) {
        UI.showModal('⚠️', 'Kein Vogel ausgewählt', 'Bitte wähle zuerst einen Vogel aus');
        return;
    }

    if (gameState.selectedInsects.length !== 2) {
        UI.showModal('⚠️', 'Falsche Kartenanzahl', 'Du benötigst genau 2 passende Insektenkarten, um einen Vogel anzulocken');
        return;
    }

    socket.emit('attractBird', gameState.currentBirdId, gameState.selectedInsects, (response) => {
        if (response.success) {
            UI.showModal('🦗', 'Vogel angelockt!', 'Du hast den Vogel erfolgreich angelockt und fotografiert!');
            gameState.currentBirdId = null;
            gameState.selectedInsects = [];
            updateActionButtons();
            requestHandUpdate();
        } else {
            UI.showModal('❌', 'Error', response.error);
        }
    });
});

// Event Listeners - End Screen
elements.newGameBtn.addEventListener('click', () => {
    location.reload();
});

// Event Listeners - Modal
elements.modalClose.addEventListener('click', () => {
    UI.hideModal();
});

// Socket Event Handlers
socket.on('diceRolled', (data) => {
    if (data.playerId !== gameState.playerId) {
        UI.animateDice(elements.dice, data.diceValue);
    }
});

socket.on('diceUpdated', (data) => {
    if (data.playerId !== gameState.playerId) {
        elements.dice.textContent = data.newDice;
        elements.dice.classList.add('updated');
        setTimeout(() => elements.dice.classList.remove('updated'), 500);
    }
});
socket.on('playerListUpdate', (players) => {
    elements.playersList.innerHTML = '';
    players.forEach((player, index) => {
        elements.playersList.appendChild(UI.createPlayerItem(player, index));
    });
    elements.playerCount.textContent = players.length;
});

socket.on('gameStarted', (state) => {
    UI.showScreen('gameScreen');
    updateGameState(state);
    requestHandUpdate();
});

socket.on('gameStateUpdate', (state) => {
    updateGameState(state);
    requestHandUpdate();
});

socket.on('gameEnded', (data) => {
    elements.winnerText.textContent = data.winners.length > 1 ? 'Unentschieden!' : `${data.winners[0].player_name} hat gewonnen!`;

    elements.finalScores.innerHTML = '';
    const winnerIds = data.winners.map(w => w.player_id);

    data.finalScores.forEach(player => {
        const isWinner = winnerIds.includes(player.playerId);
        elements.finalScores.appendChild(UI.createFinalScoreItem(player, isWinner));
    });

    UI.showScreen('endScreen');
});

// Helper Functions
function updateGameState(state) {
    // Update local state for calculations
    gameState.visibleBirds = state.visibleBirds;
    gameState.currentDistance = state.currentDistance || 0;
    gameState.currentPlayerIndex = state.currentPlayerIndex;
    gameState.currentBirdId = state.currentBirdId; // Sync bird ID from server

    if (!gameState.currentBirdId) {
        elements.selectedBirdInfo.innerHTML = 'Kein Vogel ausgewählt';
    }

    // Update player's own order if found
    const me = state.players.find(p => p.playerId === gameState.playerId);
    if (me) {
        gameState.playerOrder = me.playerOrder;
    }

    // Reset local selection/flags if it's no longer our turn
    const isMyTurn = gameState.playerOrder === gameState.currentPlayerIndex;
    if (!isMyTurn) {
        isPhotoPending = false;
        gameState.selectedInsects = [];
    } else if (state.pendingAction && state.pendingAction.type === 'photo') {
        // Sync photo state if it's our turn and an action is pending
        isPhotoPending = true;
        elements.dice.textContent = state.pendingAction.diceValue;
    }

    // Update deck counts
    elements.birdDeckCount.textContent = state.birdDeckCount;
    elements.insectDeckCount.textContent = state.insectDeckCount;

    // Update players
    elements.playersInfo.innerHTML = '';
    state.players.forEach(player => {
        const isActive = player.playerOrder === state.currentPlayerIndex;
        elements.playersInfo.appendChild(UI.createPlayerCard(player, isActive));

        if (isActive) {
            elements.currentPlayerName.textContent = player.playerName;
        }

        // Update own score
        if (player.playerId === gameState.playerId) {
            elements.playerScore.textContent = `${player.score} Pkt`;
        }
    });

    // Update visible birds
    elements.visibleBirds.innerHTML = '';
    state.visibleBirds.forEach(bird => {
        const card = UI.createBirdCard(bird);
        card.addEventListener('click', () => {
            if (gameState.playerOrder === gameState.currentPlayerIndex) {
                selectBird(bird);
            }
        });

        // Add selected class if this bird is the current one
        if (bird.id === gameState.currentBirdId) {
            card.classList.add('selected');
        }

        elements.visibleBirds.appendChild(card);
    });

    // Update distance tracker
    UI.updateDistanceTracker(state.currentDistance || 0);

    // Update action buttons
    updateActionButtons();
}

function selectBird(bird) {
    gameState.currentBirdId = bird.id;

    // Visual feedback
    document.querySelectorAll('.bird-card').forEach(card => {
        card.classList.remove('selected');
    });
    document.querySelector(`[data-bird-id="${bird.id}"]`).classList.add('selected');

    elements.selectedBirdInfo.innerHTML = `
        <strong>${bird.name}</strong> ausgewählt<br>
        <small>Benötigt ${UI.getInsectTypeName(bird.insect_type)} zum Anlocken</small>
    `;

    updateActionButtons();
}

function requestHandUpdate() {
    socket.emit('getHand', (response) => {
        if (response.success) {
            gameState.myHand = response.hand;
            updateHandDisplay();
        }
    });
}

function updateHandDisplay() {
    // Update insect hand
    elements.insectHand.innerHTML = '';
    gameState.myHand.insects.forEach(insect => {
        const card = UI.createInsectCard(insect);
        card.addEventListener('click', () => toggleInsectSelection(insect.id, card));
        elements.insectHand.appendChild(card);
    });

    // Update captured birds
    elements.capturedBirds.innerHTML = '';
    gameState.myHand.birds.forEach(bird => {
        elements.capturedBirds.appendChild(UI.createCapturedBirdMini(bird));
    });
}

function toggleInsectSelection(insectId, cardElement) {
    const index = gameState.selectedInsects.indexOf(insectId);

    if (index > -1) {
        gameState.selectedInsects.splice(index, 1);
        cardElement.classList.remove('selected');
    } else {
        gameState.selectedInsects.push(insectId);
        cardElement.classList.add('selected');
    }

    updateActionButtons();
}

function applySelectedBonuses() {
    if (gameState.selectedInsects.length === 0) return;

    const insectId = gameState.selectedInsects.shift();

    socket.emit('applyBonusToPhoto', insectId, (response) => {
        if (response.success) {
            elements.dice.textContent = response.newDice;
            elements.dice.classList.add('updated');
            setTimeout(() => elements.dice.classList.remove('updated'), 500);

            // Visual feedback: remove card or fade it
            const cardElement = document.querySelector(`[data-insect-id="${insectId}"]`);
            if (cardElement) cardElement.style.opacity = '0.3';

            // Continue with next selected insect
            if (gameState.selectedInsects.length > 0) {
                applySelectedBonuses();
            } else {
                updateActionButtons();
                requestHandUpdate();
            }
        } else {
            UI.showModal('❌', 'Fehler', response.error);
            // On error, reset to allow retry
            updateActionButtons();
            requestHandUpdate();
        }
    });
}

function updateActionButtons() {
    const isMyTurn = gameState.playerOrder === gameState.currentPlayerIndex;
    const hasBirdSelected = gameState.currentBirdId !== null;

    if (!isMyTurn) {
        elements.sneakBtn.disabled = true;
        elements.photoBtn.disabled = true;
        elements.confirmBtn.disabled = true;
        elements.applyBonusBtn.disabled = true;
        elements.captureAllBtn.disabled = true;
        elements.attractBtn.disabled = true;

        // Hide some buttons to be clear
        elements.confirmBtn.style.display = 'none';
        elements.applyBonusBtn.style.display = 'none';
        elements.captureAllBtn.style.display = 'none';
        elements.photoBtn.style.display = 'inline-block';
        return;
    }

    if (isPhotoPending) {
        elements.sneakBtn.disabled = true;
        elements.photoBtn.style.display = 'none';
        elements.confirmBtn.style.display = 'inline-block';
        elements.confirmBtn.disabled = false;
        elements.attractBtn.disabled = true;

        // Bonus and Capture All buttons
        const hasSelection = gameState.selectedInsects.length > 0;
        const sameInsectsSelected = checkThreeSameInsects();

        elements.applyBonusBtn.style.display = hasSelection ? 'inline-block' : 'none';
        elements.applyBonusBtn.disabled = !hasSelection;

        if (sameInsectsSelected) {
            const potentialCount = countCapturableBirds();
            elements.captureAllBtn.style.display = 'inline-block';
            elements.captureAllBtn.innerHTML = `<span class="btn-icon">📸✨</span> ${potentialCount} Vögel fangen`;
            elements.captureAllBtn.disabled = false;
        } else {
            elements.captureAllBtn.style.display = 'none';
        }
    } else {
        elements.sneakBtn.disabled = !hasBirdSelected;
        elements.photoBtn.style.display = 'inline-block';
        elements.photoBtn.disabled = !hasBirdSelected;
        elements.confirmBtn.style.display = 'none';
        elements.applyBonusBtn.style.display = 'none';
        elements.captureAllBtn.style.display = 'none';
        elements.attractBtn.disabled = !hasBirdSelected || gameState.selectedInsects.length !== 2;
    }
}

function countCapturableBirds() {
    if (!gameState.visibleBirds) return 0;
    const diceValue = parseInt(elements.dice.textContent);
    if (isNaN(diceValue)) return 0;

    const currentDistance = gameState.currentDistance || 0;
    let count = 0;

    gameState.visibleBirds.forEach(bird => {
        if (checkPhotoSuccessClient(diceValue, bird, currentDistance)) {
            count++;
        }
    });

    return count;
}

function checkPhotoSuccessClient(diceValue, birdCard, currentDistance) {
    // Check current distance and all greater distances (0=far, 1=mid, 2=near)
    for (let dist = 0; dist <= currentDistance; dist++) {
        if (checkDiceMatchClient(diceValue, birdCard, dist)) {
            return true;
        }
    }
    return false;
}

function checkDiceMatchClient(diceValue, birdCard, distance) {
    let requirement;

    switch (distance) {
        case 0: // far
            requirement = birdCard.distance_far_dice;
            break;
        case 1: // mid
            requirement = birdCard.distance_mid_dice;
            break;
        case 2: // near
            requirement = birdCard.distance_near_dice;
            break;
        default:
            return false;
    }

    if (!requirement) return false;

    // Parse requirement (e.g., "1-3", "4", "5-6")
    if (String(requirement).includes('-')) {
        const [min, max] = String(requirement).split('-').map(Number);
        return diceValue >= min && diceValue <= max;
    } else {
        return diceValue === parseInt(requirement);
    }
}

function checkThreeSameInsects() {
    if (gameState.selectedInsects.length !== 3) return false;

    const selectedCards = gameState.myHand.insects.filter(i =>
        gameState.selectedInsects.includes(i.id)
    );

    if (selectedCards.length !== 3) return false;

    const firstType = selectedCards[0].card_type;
    return selectedCards.every(c => c.card_type === firstType);
}

// Initialize
console.log('🐦 Vogelfotografie client initialized');
UI.showScreen('lobbyScreen');
