// UI Components for Vogelfotografie

// Create bird card element
function createBirdCard(bird, selectable = true) {
    const card = document.createElement('div');
    card.className = 'bird-card';
    card.dataset.birdId = bird.id;

    card.innerHTML = `
        <div class="bird-card-image-container">
            <img src="assets/cards/birds/${bird.id}.png" alt="${bird.name}" class="bird-card-illustration" onerror="this.onerror=null; this.src='assets/bird_placeholder.png';">
            <div class="card-interaction-overlay"></div>
            <div class="card-status-badges">
                ${bird.captured ? '<span class="status-badge captured">Abfotografiert</span>' : ''}
            </div>
        </div>
    `;

    if (selectable) {
        card.style.cursor = 'pointer';
    }

    return card;
}

// Create insect card element
function createInsectCard(insect, selectable = true) {
    const card = document.createElement('div');
    card.className = 'insect-card';
    card.dataset.insectId = insect.id;
    card.dataset.insectType = insect.card_type;
    card.dataset.bonusAction = insect.bonus_action;

    card.innerHTML = `
        <div class="insect-card-content">
            <div class="insect-type">${getInsectEmoji(insect.card_type)}</div>
            <div class="insect-bonus">${getBonusActionShort(insect.bonus_action)}</div>
            <div class="card-interaction-overlay"></div>
        </div>
    `;

    if (selectable) {
        card.style.cursor = 'pointer';
    }

    return card;
}

// Create mini captured bird element
function createCapturedBirdMini(bird) {
    const mini = document.createElement('div');
    mini.className = 'captured-bird-mini';

    mini.innerHTML = `
        <span class="captured-bird-name">${bird.name}</span>
        <span class="captured-bird-points">${bird.prestige_points}pts</span>
    `;

    return mini;
}

// Create player item for lobby
function createPlayerItem(player, index) {
    const item = document.createElement('div');
    item.className = 'player-item';

    const colors = ['#4A9EFF', '#50C878', '#FF6B9D', '#FFB84D'];
    const color = colors[index % colors.length];

    item.innerHTML = `
        <div class="player-avatar" style="background: ${color}">
            ${player.playerName.charAt(0).toUpperCase()}
        </div>
        <div class="player-name">${player.playerName}</div>
    `;

    return item;
}

// Create player card for game
function createPlayerCard(player, isActive = false) {
    const card = document.createElement('div');
    card.className = `player-card ${isActive ? 'active' : ''}`;
    card.dataset.playerId = player.playerId;

    const colors = ['#4A9EFF', '#50C878', '#FF6B9D', '#FFB84D'];
    const color = colors[player.playerOrder % colors.length];

    card.innerHTML = `
        <div class="player-card-header">
            <div class="player-card-avatar" style="background: ${color}">
                ${player.playerName.charAt(0).toUpperCase()}
            </div>
            <div class="player-card-name">${player.playerName}</div>
            <div class="player-card-stats">
                <div class="player-card-score">🏆 ${player.score}</div>
                <div class="player-card-insects">🦗 ${player.insectCount || 0}</div>
            </div>
        </div>
    `;

    return card;
}

// Create final score item
function createFinalScoreItem(player, isWinner = false) {
    const item = document.createElement('div');
    item.className = `final-score-item ${isWinner ? 'winner' : ''}`;

    const b = player.breakdown;
    item.innerHTML = `
        <div class="final-score-main">
            <span>${isWinner ? '🏆 ' : ''}${player.playerName}</span>
            <span>${player.score} Punkte</span>
        </div>
        ${b ? `
        <div class="final-score-breakdown">
            <span>1er: ${b.counts.p1} (${b.p1}P)</span>
            <span>2er: ${b.counts.p2} (${b.p2}P)</span>
            <span>3er: ${b.counts.p3} (${b.p3}P)</span>
            <span class="bonus-tag">Bonus: +${b.bonus}</span>
        </div>
        ` : ''}
    `;

    return item;
}

// Show modal notification
function showModal(icon, title, message) {
    const modal = document.getElementById('modal');
    const modalIcon = document.getElementById('modalIcon');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');

    modalIcon.textContent = icon;
    modalTitle.textContent = title;
    modalMessage.textContent = message;

    modal.classList.add('active');
}

// Hide modal
function hideModal() {
    const modal = document.getElementById('modal');
    modal.classList.remove('active');
}

// Show screen
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

// Animate dice roll
function animateDice(element, finalValue, callback, skipAnimation = false) {
    if (skipAnimation) {
        if (finalValue === 'bird') element.textContent = '🐦';
        else if (finalValue === 'blank') element.textContent = '⬜';
        else element.textContent = finalValue;
        if (callback) callback();
        return;
    }
    element.classList.add('rolling');

    // Determine if this is a sneak dice (icons) or photo dice (numbers)
    const isSneakDice = (finalValue === 'bird' || finalValue === 'blank');

    let count = 0;
    const interval = setInterval(() => {
        if (isSneakDice) {
            element.textContent = count % 2 === 0 ? '🐦' : '⬜';
        } else {
            element.textContent = Math.floor(Math.random() * 6) + 1;
        }
        count++;

        if (count >= 10) {
            clearInterval(interval);
            if (finalValue === 'bird') {
                element.textContent = '🐦';
            } else if (finalValue === 'blank') {
                element.textContent = '⬜';
            } else {
                element.textContent = finalValue;
            }
            element.classList.remove('rolling');
            if (callback) callback();
        }
    }, 60);
}

// Update distance tracker
function updateDistanceTracker(currentDistance) {
    const steps = document.querySelectorAll('.distance-step');
    steps.forEach((step, index) => {
        if (index <= currentDistance) {
            step.classList.add('active');
        } else {
            step.classList.remove('active');
        }
    });
}

// Format dice requirement for display
function formatDiceRequirement(requirement) {
    if (!requirement) return '—';
    return requirement;
}

// Get insect type name
function getInsectTypeName(type) {
    const names = {
        'ant': 'Ameise',
        'caterpillar': 'Raupe',
        'grasshopper': 'Grashüpfer',
        'fly': 'Fliege'
    };
    return names[type] || type;
}

// Get insect emoji
function getInsectEmoji(type) {
    const emojis = {
        'ant': '🐜',
        'caterpillar': '🐛',
        'grasshopper': '🦗',
        'fly': '🦟'
    };
    return emojis[type] || '🐜';
}

// Get bonus action description
function getBonusActionDescription(action) {
    const descriptions = {
        'decrease': 'Würfelergebnis um 1 verringern',
        'increase': 'Würfelergebnis um 1 erhöhen',
        'reroll': 'Würfel erneut werfen',
        'flip': 'Würfel auf die Gegenseite drehen'
    };
    return descriptions[action] || action;
}

// Get short bonus action name
function getBonusActionShort(action) {
    const shorts = {
        'decrease': '-1 🎲',
        'increase': '+1 🎲',
        'reroll': 'Neu Würfeln 🎲',
        'flip': 'Flip 🎲'
    };
    return shorts[action] || action;
}

// Check if a photo roll is successful
function checkPhotoSuccess(diceValue, bird, distance) {
    for (let d = 0; d <= distance; d++) {
        let req;
        if (d === 0) req = bird.distance_far_dice;
        if (d === 1) req = bird.distance_mid_dice;
        if (d === 2) req = bird.distance_near_dice;

        if (!req) continue;

        if (req.includes('-')) {
            const [min, max] = req.split('-').map(Number);
            if (diceValue >= min && diceValue <= max) return true;
        } else if (diceValue === parseInt(req)) {
            return true;
        }
    }
    return false;
}

// Export functions
window.UIComponents = {
    createBirdCard,
    createInsectCard,
    createCapturedBirdMini,
    createPlayerItem,
    createPlayerCard,
    createFinalScoreItem,
    showModal,
    hideModal,
    showScreen,
    animateDice,
    updateDistanceTracker,
    formatDiceRequirement,
    getInsectTypeName,
    getInsectEmoji,
    getBonusActionDescription,
    getBonusActionShort,
    checkPhotoSuccess
};
