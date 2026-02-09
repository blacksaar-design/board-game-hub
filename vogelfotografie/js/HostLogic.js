/**
 * HostLogic.js - Browser-side "Server" for Vogelfotografie
 * Runs only on the room creator's machine.
 */

class VogelfotografieHost {
    constructor(bridge) {
        this.bridge = bridge;
        this.cards = null;
        this.players = [];
        this.gameState = {
            birdDeck: [],
            insectDeck: [],
            visibleBirds: [],
            birdDiscard: [],
            currentPlayerIndex: 0,
            status: 'waiting',
            currentDistance: 0,
            currentBirdId: null,
            pendingAction: null
        };
    }

    async init() {
        const response = await fetch('js/cards.json');
        this.cards = await response.json();
    }

    addPlayer(id, name, callback) {
        if (this.players.length >= 4) {
            return callback({ success: false, error: 'Raum ist voll' });
        }

        const player = {
            playerId: id,
            playerName: name,
            playerOrder: this.players.length,
            score: 0,
            hand: { insects: [], birds: [] }
        };

        this.players.push(player);
        console.log('[Host] Player added:', name, id);

        this.bridge.broadcast('playerListUpdate', this.players.map(p => ({
            playerId: p.playerId,
            playerName: p.playerName,
            playerOrder: p.playerOrder
        })));

        callback({ success: true, playerId: id });
    }

    handleEvent(event, data, callback, senderId) {
        console.log(`[Host] Handling event: ${event} from ${senderId}`, data);

        switch (event) {
            case 'joinRoomInternal':
                this.addPlayer(senderId, data.playerName, callback);
                break;
            case 'startGame':
                this.startGame(callback);
                break;
            case 'sneak':
                this.handleSneak(data.birdId, data.useInsect, data.insectId, senderId, callback);
                break;
            case 'startPhotoRoll':
                this.handleStartPhotoRoll(data.birdId, senderId, callback);
                break;
            case 'applyBonusToPhoto':
                this.handleApplyBonus(data, senderId, callback);
                break;
            case 'resolvePhoto':
                this.handleResolvePhoto(senderId, callback);
                break;
            case 'attract':
                this.handleAttract(data.birdId, data.insectIds, senderId, callback);
                break;
            case 'getHand':
                const player = this.players.find(p => p.playerId === senderId);
                callback(player ? player.hand : { insects: [], birds: [] });
                break;
            default:
                console.warn('[Host] Unknown event:', event);
        }
    }

    startGame(callback) {
        if (this.players.length < 1) {
            return callback({ success: false, error: 'Mindest 1 Spieler erforderlich' });
        }

        // Shuffle cards
        this.gameState.birdDeck = this._shuffle([...this.cards.birds]);
        this.gameState.insectDeck = this._shuffle([...this.cards.insects]);

        // Visible birds (top 3)
        this.gameState.visibleBirds = this.gameState.birdDeck.splice(0, 3);

        // Initial hands (3 insects each)
        this.players.forEach(p => {
            p.hand.insects = this.gameState.insectDeck.splice(0, 3);
        });

        this.gameState.status = 'playing';
        this.gameState.currentPlayerIndex = 0;

        this.bridge.broadcast('gameStarted', this._getFullState());
        callback({ success: true });
    }

    handleSneak(birdId, useInsect, insectId, senderId, callback) {
        if (!this._isTurn(senderId)) return callback({ success: false, error: 'Nicht dein Zug' });

        let result;
        if (useInsect) {
            // Success guaranteed
            result = 'blank';
            const player = this.players.find(p => p.playerId === senderId);
            player.hand.insects = player.hand.insects.filter(i => i.id !== insectId);
        } else {
            // Roll sneak dice (4/6 blank, 2/6 bird)
            const roll = Math.floor(Math.random() * 6);
            result = roll < 4 ? 'blank' : 'bird';
        }

        if (result === 'blank') {
            this.gameState.currentDistance = Math.min(2, this.gameState.currentDistance + 1);
            this.gameState.currentBirdId = birdId;
            this.bridge.broadcast('diceRolled', { playerId: senderId, diceValue: result, skipAnimation: useInsect });
            callback({ success: true, result: 'success', newDistance: this.gameState.currentDistance, diceValue: result });
        } else {
            // Bird flies away!
            this.gameState.birdDiscard.push(birdId);
            this._replaceBird(birdId);

            // Draw compensatory insect
            const player = this.players.find(p => p.playerId === senderId);
            if (this.gameState.insectDeck.length > 0) {
                player.hand.insects.push(this.gameState.insectDeck.shift());
            }

            this.gameState.currentDistance = 0;
            this.gameState.currentBirdId = null;
            this.bridge.broadcast('diceRolled', { playerId: senderId, diceValue: 'bird' });

            this.nextTurn();
            callback({ success: true, result: 'scared' });
        }

        this.updateClients();
    }

    handleStartPhotoRoll(birdId, senderId, callback) {
        if (!this._isTurn(senderId)) return callback({ success: false, error: 'Nicht dein Zug' });

        const diceValue = Math.floor(Math.random() * 6) + 1;
        this.gameState.pendingAction = {
            type: 'photo',
            birdId: birdId,
            diceValue: diceValue,
            playerId: senderId
        };

        this.bridge.broadcast('diceRolled', { playerId: senderId, diceValue });
        callback({ success: true, diceValue });
        this.updateClients();
    }

    handleApplyBonus(insectCardId, senderId, callback) {
        const player = this.players.find(p => p.playerId === senderId);
        const insect = player.hand.insects.find(i => i.id === insectCardId);

        if (!insect) return callback({ success: false, error: 'Karte nicht gefunden' });

        let newVal = this.gameState.pendingAction.diceValue;
        switch (insect.bonus_action) {
            case 'increase': newVal = Math.min(6, newVal + 1); break;
            case 'decrease': newVal = Math.max(1, newVal - 1); break;
            case 'flip': newVal = 7 - newVal; break;
            case 'reroll': newVal = Math.floor(Math.random() * 6) + 1; break;
        }

        this.gameState.pendingAction.diceValue = newVal;
        player.hand.insects = player.hand.insects.filter(i => i.id !== insectCardId);

        this.bridge.broadcast('diceUpdated', { playerId: senderId, newDice: newVal });
        callback({ success: true, newDice: newVal });
        this.updateClients();
    }

    handleResolvePhoto(senderId, callback) {
        const action = this.gameState.pendingAction;
        const bird = this.gameState.visibleBirds.find(b => b.id === action.birdId);
        const player = this.players.find(p => p.playerId === senderId);

        const success = this._checkPhotoSuccess(action.diceValue, bird, this.gameState.currentDistance);

        if (success) {
            player.hand.birds.push(bird);
            player.score += bird.prestige_points;
            this._replaceBird(bird.id);
            callback({ success: true, result: 'captured' });
        } else {
            this.gameState.birdDiscard.push(bird.id);
            this._replaceBird(bird.id);

            // Draw compensatory insect
            if (this.gameState.insectDeck.length > 0) {
                player.hand.insects.push(this.gameState.insectDeck.shift());
            }

            callback({ success: true, result: 'scared' });
        }

        this.gameState.pendingAction = null;
        this.gameState.currentDistance = 0;
        this.gameState.currentBirdId = null;

        this.nextTurn();
        this.updateClients();
    }

    handleAttract(birdId, insectIds, senderId, callback) {
        if (!this._isTurn(senderId)) return callback({ success: false, error: 'Nicht dein Zug' });

        const player = this.players.find(p => p.playerId === senderId);
        const bird = this.gameState.visibleBirds.find(b => b.id === birdId);

        // Logic check: 2 matching insects of correct type
        const usedInsects = player.hand.insects.filter(i => insectIds.includes(i.id));
        const allCorrectType = usedInsects.every(i => i.card_type === bird.insect_type);

        if (usedInsects.length === 2 && allCorrectType) {
            player.hand.insects = player.hand.insects.filter(i => !insectIds.includes(i.id));
            player.hand.birds.push(bird);
            player.score += bird.prestige_points;
            this._replaceBird(bird.id);

            this.gameState.currentDistance = 0;
            this.gameState.currentBirdId = null;
            this.nextTurn();
            this.updateClients();
            callback({ success: true });
        } else {
            callback({ success: false, error: 'Ungültige Insektenkarten' });
        }
    }

    nextTurn() {
        this.gameState.currentPlayerIndex = (this.gameState.currentPlayerIndex + 1) % this.players.length;
        this.gameState.currentDistance = 0;
        this.gameState.currentBirdId = null;

        if (this.gameState.birdDeck.length === 0 || this.gameState.insectDeck.length === 0) {
            this.endGame();
        }
    }

    endGame() {
        this.gameState.status = 'finished';
        const finalScores = this.players.map(p => ({
            playerId: p.playerId,
            playerName: p.playerName,
            score: p.score
        }));
        this.bridge.broadcast('gameEnded', { finalScores });
    }

    _replaceBird(birdId) {
        const index = this.gameState.visibleBirds.findIndex(b => b.id === birdId);
        if (index !== -1) {
            if (this.gameState.birdDeck.length > 0) {
                this.gameState.visibleBirds[index] = this.gameState.birdDeck.shift();
            } else {
                this.gameState.visibleBirds.splice(index, 1);
            }
        }
    }

    updateClients() {
        this.bridge.broadcast('gameStateUpdate', this._getFullState());
    }

    _getFullState() {
        return {
            visibleBirds: this.gameState.visibleBirds,
            birdDeckCount: this.gameState.birdDeck.length,
            insectDeckCount: this.gameState.insectDeck.length,
            currentPlayerIndex: this.gameState.currentPlayerIndex,
            currentDistance: this.gameState.currentDistance,
            currentBirdId: this.gameState.currentBirdId,
            players: this.players.map(p => ({
                playerId: p.playerId,
                playerName: p.playerName,
                playerOrder: p.playerOrder,
                score: p.score
            }))
        };
    }

    _isTurn(id) {
        return this.players[this.gameState.currentPlayerIndex].playerId === id;
    }

    _shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    _checkPhotoSuccess(diceValue, bird, distance) {
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
}
