// Core game logic for Vogelfotografie
const db = require('./database');

// Shuffle array using Fisher-Yates algorithm
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Initialize a new game
async function initializeGame(gameId) {
    // Get all cards from database
    const allBirds = await db.getAllBirdCards();
    const allInsects = await db.getAllInsectCards();

    // Shuffle decks
    const birdIds = shuffleArray(allBirds.map(b => b.id));
    const insectIds = shuffleArray(allInsects.map(i => i.id));

    // Draw 3 visible birds
    const visibleBirds = birdIds.splice(0, 3);

    // Create game state
    await db.createGameState(gameId, visibleBirds, birdIds, insectIds);

    return {
        visibleBirds,
        birdDeckCount: birdIds.length,
        insectDeckCount: insectIds.length
    };
}

// Roll the sneak dice (4 blank sides, 2 bird sides - 4/6 chance)
function rollSneakDice() {
    const roll = Math.floor(Math.random() * 6) + 1;
    return roll <= 4 ? 'blank' : 'bird'; // 4 out of 6 success (blank)
}

// Roll the photo dice (standard 6-sided)
function rollPhotoDice() {
    return Math.floor(Math.random() * 6) + 1;
}

// Check if dice value matches bird requirement at given distance
function checkDiceMatch(diceValue, birdCard, distance) {
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
    if (requirement.includes('-')) {
        const [min, max] = requirement.split('-').map(Number);
        return diceValue >= min && diceValue <= max;
    } else {
        return diceValue === parseInt(requirement);
    }
}

// Check if dice matches at current distance OR any greater distance (left of current)
function checkPhotoSuccess(diceValue, birdCard, currentDistance) {
    // Check current distance and all greater distances (0=far, 1=mid, 2=near)
    for (let dist = 0; dist <= currentDistance; dist++) {
        if (checkDiceMatch(diceValue, birdCard, dist)) {
            return true;
        }
    }
    return false;
}

// Apply insect card bonus to dice value
function applyInsectBonus(diceValue, bonusAction) {
    switch (bonusAction) {
        case 'decrease':
            return Math.max(1, diceValue - 1);
        case 'increase':
            return Math.min(6, diceValue + 1);
        case 'flip':
            return 7 - diceValue; // Opposite side of dice
        case 'reroll':
            return rollPhotoDice(); // New roll
        default:
            return diceValue;
    }
}

// Draw a card from deck
async function drawCard(gameId, deckType) {
    const state = await db.getGameState(gameId);

    if (deckType === 'bird') {
        if (state.bird_deck.length === 0) return null;
        const cardId = state.bird_deck.shift();
        await db.updateGameState(gameId, { bird_deck: state.bird_deck });
        return await db.getBirdCardById(cardId);
    } else if (deckType === 'insect') {
        if (state.insect_deck.length === 0) return null;
        const cardId = state.insect_deck.shift();
        await db.updateGameState(gameId, { insect_deck: state.insect_deck });
        return await db.getInsectCardById(cardId);
    }

    return null;
}

// Discard a bird (bird flies away)
async function discardBird(gameId, birdId) {
    const state = await db.getGameState(gameId);

    // Remove from visible birds
    const visibleBirds = state.visible_birds.filter(id => id !== birdId);

    // Add to discard pile
    const birdDiscard = [...state.bird_discard, birdId];

    // Draw new bird if deck has cards
    if (state.bird_deck.length > 0) {
        const newBirdId = state.bird_deck.shift();
        visibleBirds.push(newBirdId);
        await db.updateGameState(gameId, {
            visible_birds: visibleBirds,
            bird_deck: state.bird_deck,
            bird_discard: birdDiscard,
            current_distance: 0,
            current_bird_id: null
        });
    } else {
        await db.updateGameState(gameId, {
            visible_birds: visibleBirds,
            bird_discard: birdDiscard,
            current_distance: 0,
            current_bird_id: null
        });
    }

    return visibleBirds;
}

// Capture a bird (successful photo)
async function captureBird(gameId, birdId, playerId) {
    const state = await db.getGameState(gameId);

    // Remove from visible birds
    const visibleBirds = state.visible_birds.filter(id => id !== birdId);

    // Draw new bird if deck has cards
    if (state.bird_deck.length > 0) {
        const newBirdId = state.bird_deck.shift();
        visibleBirds.push(newBirdId);
        await db.updateGameState(gameId, {
            visible_birds: visibleBirds,
            bird_deck: state.bird_deck,
            current_distance: 0,
            current_bird_id: null
        });
    } else {
        await db.updateGameState(gameId, {
            visible_birds: visibleBirds,
            current_distance: 0,
            current_bird_id: null
        });
    }

    // Add bird to player's collection
    await db.addPlayerCard(playerId, 'bird', birdId);

    // Update player score
    const birdCard = await db.getBirdCardById(birdId);
    const playerCards = await db.getPlayerCards(playerId, 'bird');
    const totalScore = await calculatePlayerScore(playerId);
    await db.updatePlayerScore(playerId, totalScore);

    return visibleBirds;
}

// Calculate player's total score
async function calculatePlayerScore(playerId) {
    const birdCards = await db.getPlayerCards(playerId, 'bird');
    let totalScore = 0;

    for (const card of birdCards) {
        const birdCard = await db.getBirdCardById(card.card_id);
        totalScore += birdCard.prestige_points;
    }

    return totalScore;
}

// Check if game should end
async function checkGameEnd(gameId) {
    const state = await db.getGameState(gameId);

    // Game ends when bird deck OR insect deck is empty
    return state.bird_deck.length === 0 || state.insect_deck.length === 0;
}

// Get winner(s)
async function getWinners(gameId) {
    const players = await db.getPlayersByGameId(gameId);

    if (players.length === 0) return [];

    // Find highest score
    const maxScore = Math.max(...players.map(p => p.score));
    const winners = players.filter(p => p.score === maxScore);

    // If tie, check number of photos
    if (winners.length > 1) {
        const photoPromises = winners.map(async w => {
            const cards = await db.getPlayerCards(w.player_id, 'bird');
            return { ...w, photoCount: cards.length };
        });
        const winnersWithPhotos = await Promise.all(photoPromises);

        const maxPhotos = Math.max(...winnersWithPhotos.map(w => w.photoCount));
        return winnersWithPhotos.filter(w => w.photoCount === maxPhotos);
    }

    return winners;
}

// Generate random room code
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

module.exports = {
    shuffleArray,
    initializeGame,
    rollSneakDice,
    rollPhotoDice,
    checkPhotoSuccess,
    applyInsectBonus,
    drawCard,
    discardBird,
    captureBird,
    calculatePlayerScore,
    checkGameEnd,
    getWinners,
    generateRoomCode
};
