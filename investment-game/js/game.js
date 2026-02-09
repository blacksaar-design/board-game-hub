// Socket initialization is handled in index.html
const socket = window.io();

// Game state
let gameState = {
    gameId: null,
    playerId: null, // Will be set on connection/creation
    playerName: null,
    currentRound: 1,
    phase: 'waiting',
    assets: [],
    players: [],
    myPrivateState: {
        cards: { up: 5, down: 5 },
        investments: []
    },
    isFirstRound: true
};

// Helper function to ensure myPrivateState is always initialized
function ensurePrivateState() {
    if (!gameState.myPrivateState) {
        gameState.myPrivateState = {
            cards: { up: 5, down: 5 },
            investments: []
        };
    }
}

// Asset names for reference
const ASSET_NAMES = ['Gold', 'Oil', 'Tech', 'Real Estate', 'Crypto'];

// DOM Elements
const screens = {
    setup: document.getElementById('setup-screen'),
    lobby: document.getElementById('lobby-screen'),
    game: document.getElementById('game-screen'),
    gameOver: document.getElementById('game-over-screen')
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('[Investment Game] DOM loaded, initializing...');
    console.log('[Investment Game] Socket available:', typeof socket !== 'undefined');
    setupEventListeners();
});

function setupEventListeners() {
    // Setup screen
    document.getElementById('create-game-btn').addEventListener('click', createGame);
    document.getElementById('join-game-btn').addEventListener('click', joinGame);

    // Lobby screen
    document.getElementById('start-game-btn').addEventListener('click', startGame);

    // Game screen
    document.getElementById('confirm-investments-btn').addEventListener('click', confirmInvestments);
    document.getElementById('next-round-btn').addEventListener('click', nextRound);

    // Game over screen
    document.getElementById('new-game-btn').addEventListener('click', () => {
        location.reload();
    });

    // Socket events
    socket.on('game-created', handleGameCreated);
    socket.on('game-joined', handleGameJoined);
    socket.on('player-joined', handlePlayerJoined);
    socket.on('player-left', handlePlayerLeft);
    socket.on('game-started', handleGameStarted);
    socket.on('state-update', handleStateUpdate);
    socket.on('phase-change', handlePhaseChange);
    socket.on('investments-placed', handleInvestmentsPlaced);
    socket.on('card-assigned', handleCardAssigned);
    socket.on('reveal', handleReveal);
    socket.on('error', handleError);
}

// Setup functions
function createGame() {
    console.log('[Investment Game] Create game clicked');
    console.log('[Investment Game] Socket:', socket);

    const playerName = document.getElementById('player-name').value.trim();
    if (!playerName) {
        alert('Please enter your name');
        return;
    }

    gameState.playerName = playerName;
    console.log('[Investment Game] Emitting create-game with playerName:', playerName);
    socket.emit('create-game', { playerName });
}

function joinGame() {
    const playerName = document.getElementById('player-name').value.trim();
    const gameCode = document.getElementById('game-code').value.trim().toUpperCase();

    if (!playerName) {
        alert('Please enter your name');
        return;
    }

    if (!gameCode) {
        alert('Please enter game code');
        return;
    }

    gameState.playerName = playerName;
    socket.emit('join-game', { playerName, gameId: gameCode });
}

function startGame() {
    socket.emit('start-game', { gameId: gameState.gameId });
}

// Socket event handlers
function handleGameCreated(data) {
    gameState.gameId = data.gameId;
    gameState.playerId = data.playerId;
    updateLobby(data.state);
    showScreen('lobby');
}

function handleGameJoined(data) {
    gameState.gameId = data.gameId;
    gameState.playerId = data.playerId;
    gameState.myPrivateState = data.privateState;
    updateLobby(data.state);
    showScreen('lobby');
}

function handlePlayerJoined(data) {
    updateLobby(data.state);
}

function handlePlayerLeft(data) {
    updateLobby(data.state);
}

function handleGameStarted(data) {
    gameState.assets = data.state.assets;
    gameState.players = data.state.players;
    gameState.currentRound = data.state.currentRound;
    gameState.phase = data.state.phase;
    gameState.isFirstRound = true;

    initializeGameBoard();
    showScreen('game');
    updateGameUI();
}

function handleStateUpdate(data) {
    gameState.players = data.state.players;
    gameState.assets = data.state.assets;
    gameState.currentRound = data.state.currentRound;
    gameState.phase = data.state.phase;

    updateGameUI();
}

function handlePhaseChange(data) {
    gameState.phase = data.phase;
    gameState.players = data.state.players;

    if (data.phase === 'card-assignment') {
        showCardAssignment();
    }

    updateGameUI();
}

function handleInvestmentsPlaced(data) {
    gameState.myPrivateState = data.privateState;
    showWaitingPanel('Waiting for other players to place investments...');
}

function handleCardAssigned(data) {
    gameState.myPrivateState = data.privateState;
    updateCardCounts();
}

function handleReveal(data) {
    gameState.assets = data.state.assets;
    gameState.players = data.state.players;
    gameState.phase = data.state.phase;
    gameState.currentRound = data.state.currentRound;

    if (data.gameEnded) {
        showGameOver(data.winner, data.state.players);
    } else {
        showRevealPanel(data.assetChanges);
        gameState.isFirstRound = false;
    }

    updateAssetBoard();
    updateScoreboard();
}

function handleError(data) {
    alert(data.message);
}

// UI Functions
function showScreen(screenName) {
    Object.values(screens).forEach(screen => screen.classList.remove('active'));
    screens[screenName].classList.add('active');
}

function updateLobby(state) {
    document.getElementById('lobby-game-code').textContent = state.gameId;
    document.getElementById('player-count').textContent = state.players.length;

    const playersList = document.getElementById('players-list-items');
    playersList.innerHTML = '';

    state.players.forEach(player => {
        const li = document.createElement('li');
        li.textContent = player.name;
        playersList.appendChild(li);
    });

    const startBtn = document.getElementById('start-game-btn');
    startBtn.disabled = state.players.length < 1;
}

function initializeGameBoard() {
    // Initialize asset board
    const assetsContainer = document.getElementById('assets-container');
    assetsContainer.innerHTML = '';

    gameState.assets.forEach((asset, index) => {
        const assetTrack = createAssetTrack(asset, index);
        assetsContainer.appendChild(assetTrack);
    });

    // Initialize investment selects
    const investmentSelects = document.querySelectorAll('.investment-select');
    investmentSelects.forEach(select => {
        select.innerHTML = '<option value="">Select Asset</option>';
        gameState.assets.forEach((asset, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = asset.name;
            select.appendChild(option);
        });
    });

    // Set player name
    document.getElementById('player-name-display').textContent = gameState.playerName;
}

function createAssetTrack(asset, index) {
    const track = document.createElement('div');
    track.className = 'asset-track';
    track.dataset.assetIndex = index;

    track.innerHTML = `
    <div class="asset-header">
      <span class="asset-name">${asset.name}</span>
      <span class="asset-value">${asset.value}</span>
    </div>
    <div class="asset-scale">
      <div class="asset-marker" style="left: ${((asset.value - 1) / 29) * 100}%"></div>
    </div>
    <div class="scale-labels">
      <span>1</span>
      <span>15</span>
      <span>30</span>
    </div>
  `;

    return track;
}

function updateGameUI() {
    // Ensure myPrivateState is initialized
    ensurePrivateState();

    // Update round
    document.getElementById('current-round').textContent = gameState.currentRound;

    // Update phase text
    let phaseText = '';
    switch (gameState.phase) {
        case 'placement':
            phaseText = gameState.isFirstRound ? 'Place All 3 Investments' : 'Move 1 Investment';
            break;
        case 'card-assignment':
            phaseText = 'Assign Your Cards';
            break;
        case 'reveal':
            phaseText = 'Round Results';
            break;
    }
    document.getElementById('phase-text').textContent = phaseText;

    // Update player money
    const myPlayer = gameState.players.find(p => p.id === gameState.playerId);
    if (myPlayer) {
        const moneyElement = document.getElementById('player-money');
        moneyElement.textContent = `$${myPlayer.money}`;
        moneyElement.className = myPlayer.money < 0 ? 'money negative' : 'money';
    }

    // Update scoreboard
    updateScoreboard();

    // Show appropriate panel
    if (gameState.phase === 'placement') {
        showInvestmentPanel();
    } else if (gameState.phase === 'card-assignment') {
        const myPlayer = gameState.players.find(p => p.id === gameState.playerId);
        console.log('[Investment Game] Card assignment phase - myPlayer:', myPlayer);
        console.log('[Investment Game] assignedCards:', myPlayer ? myPlayer.assignedCards : 'no player');
        if (myPlayer && !myPlayer.assignedCards) {
            console.log('[Investment Game] Showing card assignment panel');
            showCardAssignment();
        } else {
            console.log('[Investment Game] Showing waiting panel');
            showWaitingPanel('Waiting for other players to assign cards...');
        }
    }
}

function showInvestmentPanel() {
    document.getElementById('investment-panel').classList.remove('hidden');
    document.getElementById('card-panel').classList.add('hidden');
    document.getElementById('waiting-panel').classList.add('hidden');
    document.getElementById('reveal-panel').classList.add('hidden');
    document.getElementById('confirm-investments-btn').style.display = 'block';

    const selects = document.querySelectorAll('.investment-select');
    const radios = document.querySelectorAll('.change-radio');

    // If not first round, show radio buttons and restrict to changing one investment
    const isAfterFirstRound = gameState.currentRound > 1;

    console.log('[Investment Game] Round:', gameState.currentRound, 'After first round:', isAfterFirstRound);

    if (isAfterFirstRound) {
        console.log('[Investment Game] Restricting to 1 investment change');

        // Ensure we have the player's investments from the previous round
        ensurePrivateState();

        // If myPrivateState.investments is empty, we need to populate it from the select values
        // This happens when the page is refreshed or state is lost
        if (!gameState.myPrivateState.investments || gameState.myPrivateState.investments.length === 0) {
            console.log('[Investment Game] Initializing investments from current select values');
            gameState.myPrivateState.investments = [];
            selects.forEach((select) => {
                const type = select.dataset.type;
                const asset = parseInt(select.value) || 0;
                gameState.myPrivateState.investments.push({ type, asset });
            });
        }

        // Show radio buttons
        radios.forEach(radio => {
            radio.style.display = 'inline-block';
            radio.disabled = false;
        });

        // Set current investments and store original values
        selects.forEach((select, index) => {
            const currentInvestment = gameState.myPrivateState.investments[index];
            if (currentInvestment) {
                select.value = currentInvestment.asset;
                select.dataset.originalValue = currentInvestment.asset;
            }
            select.disabled = true; // Disable all initially
        });

        // Select first radio by default and enable its select
        if (radios.length > 0) {
            radios[0].checked = true;
            selects[0].disabled = false;
        }

        // Track if any change has been made
        let changeMade = false;

        // Add change listeners to radios
        radios.forEach((radio, index) => {
            radio.onclick = () => {
                if (!changeMade) {
                    // Disable all selects
                    selects.forEach(s => s.disabled = true);
                    // Enable only the selected one
                    selects[index].disabled = false;
                }
            };
        });

        // Add change listeners to selects to detect modifications
        selects.forEach((select, index) => {
            select.addEventListener('change', function () {
                if (!changeMade && this.value !== this.dataset.originalValue) {
                    // A change has been made - lock everything else
                    changeMade = true;

                    // Disable all radio buttons
                    radios.forEach(r => r.disabled = true);

                    // Disable all other selects
                    selects.forEach((s, i) => {
                        if (i !== index) {
                            s.disabled = true;
                        }
                    });
                }
            });
        });
    } else {
        console.log('[Investment Game] First round - all investments can be changed');
        // First round - hide radio buttons and enable all selects
        radios.forEach(radio => {
            radio.style.display = 'none';
            radio.disabled = false;
        });
        selects.forEach(select => {
            select.disabled = false;
            delete select.dataset.originalValue;
        });
    }
}

function showInvestmentPanelReadOnly() {
    // Show investments but make them read-only
    document.getElementById('investment-panel').classList.remove('hidden');

    const selects = document.querySelectorAll('.investment-select');
    const radios = document.querySelectorAll('.change-radio');

    // Safety check for myPrivateState
    if (gameState.myPrivateState && gameState.myPrivateState.investments) {
        selects.forEach((select, index) => {
            const currentInvestment = gameState.myPrivateState.investments[index];
            if (currentInvestment) {
                select.value = currentInvestment.asset;
            }
            select.disabled = true;
        });
    } else {
        // If no private state, just disable all selects
        selects.forEach(select => {
            select.disabled = true;
        });
    }

    radios.forEach(radio => {
        radio.style.display = 'none';
    });

    document.getElementById('confirm-investments-btn').style.display = 'none';
}


function showCardAssignment() {
    // Keep investment panel visible but read-only
    showInvestmentPanelReadOnly();

    document.getElementById('card-panel').classList.remove('hidden');
    document.getElementById('waiting-panel').classList.add('hidden');
    document.getElementById('reveal-panel').classList.add('hidden');

    const cardAssignmentArea = document.getElementById('card-assignment-area');

    // Only render if not already rendered (to prevent re-rendering on state updates)
    if (cardAssignmentArea.children.length === 0) {
        console.log('[Investment Game] Rendering card assignment buttons');
        gameState.assets.forEach((asset, index) => {
            const row = document.createElement('div');
            row.className = 'card-assignment-row';
            row.innerHTML = `
          <span class="card-assignment-label">${asset.name}</span>
          <div class="card-buttons">
            <button class="card-btn up" data-asset="${index}" data-type="up">↑</button>
            <button class="card-btn down" data-asset="${index}" data-type="down">↓</button>
          </div>
        `;

            cardAssignmentArea.appendChild(row);
        });

        // Add event listeners to card buttons
        document.querySelectorAll('.card-btn').forEach(btn => {
            btn.addEventListener('click', assignCard);
        });
    } else {
        console.log('[Investment Game] Card buttons already rendered, skipping');
    }

    updateCardCounts();
}

function showWaitingPanel(text) {
    document.getElementById('investment-panel').classList.add('hidden');
    document.getElementById('card-panel').classList.add('hidden');
    document.getElementById('waiting-panel').classList.remove('hidden');
    document.getElementById('reveal-panel').classList.add('hidden');

    document.getElementById('waiting-text').textContent = text;
}

function showRevealPanel(assetChanges) {
    // Keep investment panel visible but read-only
    showInvestmentPanelReadOnly();

    document.getElementById('card-panel').classList.add('hidden');
    document.getElementById('waiting-panel').classList.add('hidden');
    document.getElementById('reveal-panel').classList.remove('hidden');

    const revealContent = document.getElementById('reveal-content');
    revealContent.innerHTML = '<h4>Asset Changes:</h4>';

    gameState.assets.forEach((asset, index) => {
        const change = assetChanges[index];
        const changeDiv = document.createElement('div');
        changeDiv.className = 'asset-change';

        const changeClass = change > 0 ? 'change-positive' : change < 0 ? 'change-negative' : '';
        const changeSymbol = change > 0 ? '+' : '';

        changeDiv.innerHTML = `
      <span>${asset.name}</span>
      <span class="${changeClass}">${changeSymbol}${change}</span>
    `;

        revealContent.appendChild(changeDiv);
    });

    // Show money change for current player
    const myPlayer = gameState.players.find(p => p.id === gameState.playerId);
    if (myPlayer) {
        const moneyChangeDiv = document.createElement('div');
        moneyChangeDiv.style.marginTop = '20px';
        moneyChangeDiv.style.padding = '15px';
        moneyChangeDiv.style.background = '#667eea';
        moneyChangeDiv.style.color = 'white';
        moneyChangeDiv.style.borderRadius = '8px';
        moneyChangeDiv.style.textAlign = 'center';
        moneyChangeDiv.style.fontSize = '18px';
        moneyChangeDiv.style.fontWeight = 'bold';
        moneyChangeDiv.innerHTML = `Your Total: $${myPlayer.money}`;

        revealContent.appendChild(moneyChangeDiv);
    }
}

function updateAssetBoard() {
    gameState.assets.forEach((asset, index) => {
        const track = document.querySelector(`[data-asset-index="${index}"]`);
        if (track) {
            const valueSpan = track.querySelector('.asset-value');
            const marker = track.querySelector('.asset-marker');

            valueSpan.textContent = asset.value;
            marker.style.left = `${((asset.value - 1) / 29) * 100}%`;
        }
    });
}

function updateScoreboard() {
    const scoreboardContent = document.getElementById('scoreboard-content');
    scoreboardContent.innerHTML = '';

    // Sort players by money
    const sortedPlayers = [...gameState.players].sort((a, b) => b.money - a.money);

    sortedPlayers.forEach(player => {
        const scoreItem = document.createElement('div');
        scoreItem.className = 'score-item';
        if (player.id === gameState.playerId) {
            scoreItem.classList.add('current-player');
        }

        scoreItem.innerHTML = `
      <span>${player.name}</span>
      <span class="${player.money < 0 ? 'money negative' : 'money'}">$${player.money}</span>
    `;

        scoreboardContent.appendChild(scoreItem);
    });
}

function updateCardCounts() {
    ensurePrivateState();

    // Update button states only if they exist
    const upButtons = document.querySelectorAll('.card-btn.up');
    const downButtons = document.querySelectorAll('.card-btn.down');

    if (upButtons.length > 0) {
        upButtons.forEach(btn => {
            btn.disabled = gameState.myPrivateState.cards.up === 0;
        });
    }

    if (downButtons.length > 0) {
        downButtons.forEach(btn => {
            btn.disabled = gameState.myPrivateState.cards.down === 0;
        });
    }
}

// Game actions
function confirmInvestments() {
    const selects = document.querySelectorAll('.investment-select');
    const investments = [];

    selects.forEach(select => {
        const assetIndex = parseInt(select.value);
        const type = select.dataset.type;

        if (select.value === '') {
            alert('Please select an asset for all investment slots');
            return;
        }

        investments.push({
            asset: assetIndex,
            type: type
        });
    });

    if (investments.length !== 3) {
        alert('Please select all 3 investments');
        return;
    }

    socket.emit('place-investments', {
        gameId: gameState.gameId,
        investments: investments
    });
}

function assignCard(event) {
    const btn = event.target;
    const assetIndex = parseInt(btn.dataset.asset);
    const cardType = btn.dataset.type;

    socket.emit('assign-card', {
        gameId: gameState.gameId,
        assetIndex: assetIndex,
        cardType: cardType
    });

    // Highlight the selected button FIRST
    btn.classList.add('assigned');

    // Visual feedback - disable both buttons for this asset
    const row = btn.closest('.card-assignment-row');
    const allButtons = row.querySelectorAll('.card-btn');
    allButtons.forEach(button => {
        button.disabled = true;
    });
}

function nextRound() {
    socket.emit('next-round', { gameId: gameState.gameId });

    // Reset UI for next round
    gameState.myPrivateState.cards = { up: 5, down: 5 };

    // Re-enable investment selects
    const selects = document.querySelectorAll('.investment-select');
    selects.forEach(select => {
        select.disabled = false;
    });

    // Show confirm button again
    document.getElementById('confirm-investments-btn').style.display = 'block';

    updateGameUI();
}

function showGameOver(winner, players) {
    showScreen('gameOver');

    document.getElementById('winner-name').textContent = `🏆 ${winner.name} Wins!`;
    document.getElementById('winner-money').textContent = `Final Score: $${winner.money}`;

    const finalScoresList = document.getElementById('final-scores-list');
    finalScoresList.innerHTML = '';

    const sortedPlayers = [...players].sort((a, b) => b.money - a.money);

    sortedPlayers.forEach((player, index) => {
        const scoreItem = document.createElement('div');
        scoreItem.className = 'final-score-item';
        scoreItem.innerHTML = `
      <span>${index + 1}. ${player.name}</span>
      <span>$${player.money}</span>
    `;
        finalScoresList.appendChild(scoreItem);
    });
}
