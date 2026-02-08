const UI = window.UIComponents;
const Network = window.Network;

// Game State
let gameState = {
    // Meta
    isHost: false,
    myPlayerId: null,
    opponentPlayerId: null,
    players: [], // { id, name, score, hand: {birds:[], insects:[]} }

    // Game Data
    birdDeck: [],
    insectDeck: [],
    visibleBirds: [],
    birdDiscard: [],
    insectDiscard: [],

    // Turn State
    currentPlayerIndex: 0,
    currentBirdId: null,
    currentDistance: 0, // 0=Far, 1=Mid, 2=Near
    pendingAction: null, // { type: 'photo', diceValue: 5 }

    // Local Selection
    selectedInsects: []
};

// --- INIT ---

async function init() {
    console.log('🎮 Game Initializing...');

    // Load Data
    try {
        const response = await fetch('data/cards.json');
        const data = await response.json();
        gameState.allBirds = data.birds;
        gameState.allInsects = data.insects;
        console.log(`Loaded ${gameState.allBirds.length} birds and ${gameState.allInsects.length} insects.`);
    } catch (e) {
        console.error('Failed to load card data:', e);
        // UI.showModal('❌', 'Fehler', 'Konnte Spieldaten nicht laden.');
        // Fallback for demo if fetch fails (e.g. strict CORS locally)
        return;
    }

    setupEventListeners();
    UI.showScreen('lobbyScreen');
}

// --- NETWORK EVENTS ---

Network.onConnected = (peerId) => {
    // This fires when WE start a connection or receive one
    document.getElementById('statusDot').classList.add('connected');
    document.getElementById('statusText').textContent = 'Verbunden';
    // For simplicity, we store the other peer ID
    // In Host mode, this might be overwritten if multiple join, but we target 2 players for now
    gameState.opponentPlayerId = peerId;
    console.log('Connected to peer:', peerId);
};

Network.onData = (msg) => {
    // console.log('Packet received:', msg);
    const { type, payload } = msg;

    switch (type) {
        case 'JOIN_REQUEST':
            handleJoinRequest(payload);
            break;
        case 'GAME_START':
            handleGameStart(payload);
            break;
        case 'STATE_UPDATE':
            handleStateUpdate(payload);
            break;
        case 'ACTION':
            if (gameState.isHost) handlePlayerAction(payload);
            break;
    }
};

// --- LOBBY LOGIC ---

function setupEventListeners() {
    // HOST GAME
    document.getElementById('createRoomBtn').addEventListener('click', () => {
        const name = document.getElementById('createPlayerName').value.trim();
        if (!name) return alert('Bitte Namen eingeben');

        gameState.isHost = true;
        gameState.myPlayerId = 'HOST';

        // Init Host State
        gameState.players = [{
            id: 'HOST',
            name: name,
            score: 0,
            hand: { birds: [], insects: [] },
            isHost: true
        }];

        Network.initHost((id) => {
            const shortCode = id.replace('VOGEL-', '');
            document.getElementById('displayRoomCode').textContent = shortCode;
            document.getElementById('gameRoomCode').textContent = shortCode;
            updateLobbyUI();
            UI.showScreen('waitingScreen');
        });
    });

    // JOIN GAME
    document.getElementById('joinRoomBtn').addEventListener('click', () => {
        const code = document.getElementById('joinRoomCode').value.trim().toUpperCase();
        const name = document.getElementById('joinPlayerName').value.trim();
        if (!code || !name) return alert('Code und Name eingeben');

        gameState.isHost = false;
        gameState.myPlayerId = 'CLIENT';

        const fullId = 'VOGEL-' + code;
        Network.joinGame(fullId, (id) => {
            document.getElementById('displayRoomCode').textContent = code;
            document.getElementById('gameRoomCode').textContent = code;
            UI.showScreen('waitingScreen');
            document.getElementById('startGameBtn').style.display = 'none'; // Client waits

            // Send Join Request after short delay to ensure connection
            setTimeout(() => {
                Network.send('JOIN_REQUEST', { name: name });
            }, 1000);
        });
    });

    // START GAME
    document.getElementById('startGameBtn').addEventListener('click', () => {
        // if (gameState.players.length < 2) return alert('Warte auf Mitspieler...');
        startGame();
    });

    // GAME ACTIONS
    document.getElementById('sneakBtn').addEventListener('click', () => sendAction('SNEAK'));
    document.getElementById('photoBtn').addEventListener('click', () => sendAction('PHOTO_ROLL'));
    // document.getElementById('confirmBtn').addEventListener('click', () => sendAction('PHOTO_RESOLVE'));
}

function updateLobbyUI() {
    const list = document.getElementById('playersList');
    list.innerHTML = '';
    gameState.players.forEach(p => {
        const item = document.createElement('div');
        item.className = 'player-item';
        item.textContent = p.name + (p.isHost ? ' (Host)' : '');
        list.appendChild(item);
    });
    document.getElementById('playerCount').textContent = gameState.players.length;
}

// --- HOST LOGIC (Server-side simulation) ---

function handleJoinRequest(payload) {
    if (!gameState.isHost) return;

    // ID isn't in payload, but we know the sender from Network.conn.peer
    // For simplicity with PeerJS single connection, we assume sender is the opponent
    const newPlayerId = 'CLIENT'; // We map connection to this ID internally for logic

    const newPlayer = {
        id: newPlayerId,
        name: payload.name,
        score: 0,
        hand: { birds: [], insects: [] },
        isHost: false
    };

    // Avoid dupes
    if (!gameState.players.find(p => p.id === newPlayerId)) {
        gameState.players.push(newPlayer);
        updateLobbyUI();
        broadcastState(); // Send updated lobby
    }
}

function startGame() {
    if (!gameState.isHost) return;

    // Shuffle
    gameState.birdDeck = shuffle(gameState.allBirds.map(b => b.id));
    gameState.insectDeck = shuffle(gameState.allInsects.map(i => i.id));

    // Deal Birds (3 visible)
    gameState.visibleBirds = gameState.birdDeck.splice(0, 3);

    // Deal Hands (3 insects each)
    gameState.players.forEach(p => {
        p.hand.insects = gameState.insectDeck.splice(0, 3);
    });

    gameState.currentPlayerIndex = 0;

    const fullState = getFullState();
    Network.send('GAME_START', fullState); // Send to Client
    handleGameStart(fullState); // Init Host UI
}

function handlePlayerAction(packet) {
    // Validate Current Player
    const player = gameState.players[gameState.currentPlayerIndex];
    // TODO: sender verification

    const { action, data } = packet;
    let updateNeeded = true;

    // -- GAME LOGIC --
    if (action === 'SNEAK') {
        const roll = Math.random() < 0.66 ? 'BLANK' : 'BIRD'; // 4/6 success
        if (roll === 'BLANK') { // Success
            if (gameState.currentDistance < 2) gameState.currentDistance++;
        } else {
            // Fail - Bird flies?
            // Simplified: Reset distance or bird flies
            gameState.currentDistance = 0;
            // Draw insect confolation?
        }
    }

    if (action === 'PHOTO_ROLL') {
        const dice = Math.floor(Math.random() * 6) + 1;
        gameState.pendingAction = { type: 'photo', diceValue: dice };
    }

    // -- END TURN CHECK --
    // If turn ends, index++ % players.length

    if (updateNeeded) broadcastState();
}

function broadcastState() {
    const fullState = getFullState();
    Network.send('STATE_UPDATE', fullState);
    // Host also updates local UI
    handleStateUpdate(fullState);
}


// --- CLIENT/SHARED LOGIC ---

function handleGameStart(state) {
    UI.showScreen('gameScreen');
    updateGameState(state);
}

function handleStateUpdate(state) {
    // Sync critical data
    gameState.players = state.players;
    gameState.visibleBirds = state.visibleBirds;
    gameState.currentPlayerIndex = state.currentPlayerIndex;
    gameState.currentDistance = state.currentDistance; // Global distance? Or per bird? 
    // In this game, 'distance' is usually per turn/bird interaction.

    updateGameState(state);
}

function updateGameState(state) {
    // 1. Render Birds
    const birdsContainer = document.getElementById('visibleBirds');
    birdsContainer.innerHTML = '';
    state.visibleBirds.forEach(birdId => {
        const bird = gameState.allBirds.find(b => b.id === birdId);
        if (bird) {
            const card = UI.createBirdCard(bird);
            birdsContainer.appendChild(card);
        }
    });

    // 2. Render Players
    const pInfo = document.getElementById('playersInfo');
    pInfo.innerHTML = '';
    state.players.forEach((p, i) => {
        const isTurn = i === state.currentPlayerIndex;
        const div = document.createElement('div');
        div.className = `player-info-card ${isTurn ? 'active' : ''}`;
        div.innerHTML = `<strong>${p.name}</strong><br>Score: ${p.score}`;
        pInfo.appendChild(div);

        if (p.id === gameState.myPlayerId) {
            // Render My Hand
            renderHand(p.hand);
        }
    });

    // 3. Status
    const currentPlayer = state.players[state.currentPlayerIndex];
    document.getElementById('currentPlayerName').textContent = currentPlayer.name;

    // 4. Controls
    // Enable buttons only if it's my turn
    const isMyTurn = currentPlayer.id === gameState.myPlayerId;
    document.getElementById('sneakBtn').disabled = !isMyTurn;
    document.getElementById('photoBtn').disabled = !isMyTurn;
}

function renderHand(hand) {
    const container = document.getElementById('insectHand');
    container.innerHTML = '';
    hand.insects.forEach(insectId => {
        const insect = gameState.allInsects.find(i => i.id === insectId);
        if (insect) {
            const card = UI.createInsectCard(insect);
            container.appendChild(card);
        }
    });
}

// --- UTILS ---

function sendAction(action, data = {}) {
    if (gameState.isHost) {
        handlePlayerAction({ action, data });
    } else {
        Network.send('ACTION', { action, data });
    }
}

function shuffle(array) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex != 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [
            array[randomIndex], array[currentIndex]];
    }
    return array;
}

function getFullState() {
    return {
        players: gameState.players,
        visibleBirds: gameState.visibleBirds,
        currentPlayerIndex: gameState.currentPlayerIndex,
        currentDistance: gameState.currentDistance,
        // ...
    };
}

// Start
init();
