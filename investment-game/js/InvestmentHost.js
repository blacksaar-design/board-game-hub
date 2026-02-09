/**
 * InvestmentHost.js - Browser-side "Server" for the Investment Game
 */

class InvestmentHost {
    constructor(bridge) {
        this.bridge = bridge;
        this.gameId = null;
        this.players = [];
        this.assets = [
            { name: 'Gold', value: 15 },
            { name: 'Oil', value: 15 },
            { name: 'Tech', value: 15 },
            { name: 'Real Estate', value: 15 },
            { name: 'Crypto', value: 15 }
        ];
        this.currentRound = 0;
        this.phase = 'waiting'; // waiting, placement, card-assignment, reveal, game-over
        this.cardAssignments = [];
        this.started = false;
    }

    addPlayer(playerId, playerName, callback) {
        if (this.players.length >= 6) return callback({ success: false, error: 'Raum ist voll' });

        const player = {
            id: playerId,
            name: playerName,
            money: 0,
            cards: { up: 5, down: 5 },
            investments: [],
            placedInvestments: false,
            assignedCards: false
        };

        this.players.push(player);
        this.bridge.broadcast('player-joined', { state: this.getState() });
        callback({ success: true, playerId, state: this.getState() });
    }

    handleEvent(event, data, callback, senderId) {
        // console.log(`[Host] Event: ${event}`, data);
        switch (event) {
            case 'joinRoomInternal':
                this.addPlayer(senderId, data.playerName, callback);
                break;
            case 'start-game':
                this.startGame(callback);
                break;
            case 'place-investments':
                this.handlePlaceInvestments(senderId, data.investments, callback);
                break;
            case 'assign-card':
                this.handleAssignCard(senderId, data.assetIndex, data.cardType, callback);
                break;
            case 'next-round':
                callback({ success: true });
                this.updateClients();
                break;
            default:
                console.warn('[Host] Unknown event:', event);
        }
    }

    startGame(callback) {
        if (this.players.length < 1) return callback({ success: false, error: 'Mindestens 1 Spieler erforderlich' });
        this.started = true;
        this.currentRound = 1;
        this.phase = 'placement';
        this.bridge.broadcast('game-started', { state: this.getState() });
        callback({ success: true });
    }

    handlePlaceInvestments(playerId, investments, callback) {
        const player = this.players.find(p => p.id === playerId);
        if (!player) return;

        player.investments = investments;
        player.placedInvestments = true;

        callback({ privateState: this.getPlayerPrivateState(playerId) });
        this.updateClients();

        if (this.players.every(p => p.placedInvestments)) {
            this.phase = 'card-assignment';
            this.bridge.broadcast('phase-change', { phase: 'card-assignment', state: this.getState() });
        }
    }

    handleAssignCard(playerId, assetIndex, cardType, callback) {
        const player = this.players.find(p => p.id === playerId);
        if (!player || player.cards[cardType] <= 0) return;

        // Check if player already assigned a card to this asset
        if (this.cardAssignments.some(c => c.playerId === playerId && c.assetIndex === assetIndex)) return;

        this.cardAssignments.push({ playerId, assetIndex, cardType });
        player.cards[cardType]--;

        const playerAssignments = this.cardAssignments.filter(c => c.playerId === playerId);
        if (playerAssignments.length === 5) {
            player.assignedCards = true;
        }

        callback({ privateState: this.getPlayerPrivateState(playerId) });
        this.updateClients();

        if (this.players.every(p => p.assignedCards)) {
            this.phase = 'reveal';
            const result = this.revealAndCalculate();
            this.bridge.broadcast('reveal', {
                state: this.getState(),
                assetChanges: result.assetChanges,
                gameEnded: result.gameEnded,
                winner: result.gameEnded ? this.getWinner() : null
            });
        }
    }

    revealAndCalculate() {
        const assetChanges = [0, 0, 0, 0, 0];
        this.cardAssignments.forEach(assignment => {
            assetChanges[assignment.assetIndex] += (assignment.cardType === 'up' ? 1 : -1);
        });

        this.assets.forEach((asset, index) => {
            asset.value = Math.max(1, Math.min(30, asset.value + assetChanges[index]));
        });

        this.players.forEach(player => {
            player.investments.forEach(inv => {
                const change = assetChanges[inv.asset] * 100;
                player.money += (inv.type === 'long' ? change : -change);
            });
        });

        const gameEnded = this.currentRound >= 12 || this.assets.some(a => a.value === 1 || a.value === 30);

        if (!gameEnded) {
            this.currentRound++;
            this.phase = 'placement';
            this.players.forEach(p => {
                p.cards = { up: 5, down: 5 };
                p.placedInvestments = false;
                p.assignedCards = false;
            });
            this.cardAssignments = [];
        } else {
            this.phase = 'game-over';
        }

        return { gameEnded, assetChanges };
    }

    getWinner() {
        if (this.players.length === 0) return null;
        return this.players.reduce((max, p) => p.money > max.money ? p : max);
    }

    getState() {
        return {
            gameId: this.bridge.roomCode,
            players: this.players.map(p => ({
                id: p.id,
                name: p.name,
                money: p.money,
                placedInvestments: p.placedInvestments,
                assignedCards: p.assignedCards
            })),
            assets: this.assets,
            currentRound: this.currentRound,
            phase: this.phase,
            started: this.started
        };
    }

    getPlayerPrivateState(playerId) {
        const p = this.players.find(p => p.id === playerId);
        return p ? { cards: p.cards, investments: p.investments } : null;
    }

    updateClients() {
        this.bridge.broadcast('state-update', { state: this.getState() });
    }
}
