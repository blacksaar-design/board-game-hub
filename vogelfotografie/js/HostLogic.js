/**
 * HostLogic.js - Browser-side "Server" for Vogelfotografie
 * Runs only on the room creator's machine.
 */

class VogelfotografieHost {
    constructor(bridge) {
        this.bridge = bridge;
        this.cards = null;
        this.players = [];
        this.rules = {
            birdBonusEnabled: false // Request: "Deaktiviere die Bonusregel für 1 Punkt Vögel, lass sie aber so dass sie leicht wieder aktiviert werden kann"
        };
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
            case 'captureAll':
                this.handleCaptureAll(data.insectIds, senderId, callback);
                break;
            case 'selectBird':
                this.handleSelectBird(data.birdId, senderId, callback);
                break;
            case 'addBot':
                this.addBot(data.difficulty, callback);
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

        // Insect Deck Scaling:
        // 1 Player: IDs 1-32 (32 cards)
        // 2 Players: IDs 1-48 (48 cards)
        // 3-4 Players: Full Set 1-64 (64 cards)
        let baseInsectDeck = [...this.cards.insects];
        const playerCount = this.players.length;

        if (playerCount === 1) {
            baseInsectDeck = baseInsectDeck.filter(i => i.id <= 32);
            this.addToLog('ℹ️ Solo-Modus: Insektenstapel auf 32 Karten begrenzt.', 'system-msg');
        } else if (playerCount === 2) {
            baseInsectDeck = baseInsectDeck.filter(i => i.id <= 48);
            this.addToLog('ℹ️ 2-Spieler-Modus: Insektenstapel auf 48 Karten begrenzt.', 'system-msg');
        } else {
            this.addToLog(`ℹ️ ${playerCount}-Spieler-Modus: Voller Insektenstapel (64 Karten) aktiv.`, 'system-msg');
        }

        this.gameState.insectDeck = this._shuffle(baseInsectDeck);

        // Visible birds (top 3)
        this.gameState.visibleBirds = this.gameState.birdDeck.splice(0, 3);

        // Initial hands (3 insects each)
        this.players.forEach(p => {
            p.hand.insects = this.gameState.insectDeck.splice(0, 3);
        });

        this.gameState.status = 'playing';
        this.gameState.currentPlayerIndex = 0;

        this.bridge.broadcast('gameStarted', this._getFullState());
        this.addToLog('🏁 Das Spiel hat begonnen!', 'turn');
        callback({ success: true });
    }

    addToLog(message, type = 'system-msg') {
        const logEntry = {
            id: Date.now() + Math.random(),
            message,
            type,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        this.bridge.broadcast('logUpdate', logEntry);
    }

    handleSneak(birdId, useInsect, insectId, senderId, callback) {
        if (!this._isTurn(senderId)) return callback({ success: false, error: 'Nicht dein Zug' });

        // Target check
        if (!this.gameState.currentBirdId || this.gameState.currentBirdId != birdId) {
            return callback({ success: false, error: 'Du musst den Vogel zuerst auswählen!' });
        }

        const player = this.players.find(p => p.playerId === senderId);
        let result;
        if (useInsect) {
            // Success guaranteed
            result = 'blank';
            player.hand.insects = player.hand.insects.filter(i => i.id !== insectId);
        } else {
            // Roll sneak dice (4/6 blank, 2/6 bird)
            const roll = Math.floor(Math.random() * 6);
            result = roll < 4 ? 'blank' : 'bird';
        }

        if (result === 'blank') {
            this.gameState.currentDistance = Math.min(2, this.gameState.currentDistance + 1);
            this.gameState.currentBirdId = birdId;
            this.addToLog(`👟 ${player.playerName} schleicht sich an... Erfolg!`, 'success');
            this.bridge.broadcast('diceRolled', { playerId: senderId, diceValue: result, skipAnimation: useInsect });
            callback({ success: true, result: 'success', newDistance: this.gameState.currentDistance, diceValue: result });
        } else {
            // Bird flies away!
            const bird = this.gameState.visibleBirds.find(b => b.id == birdId);
            this.addToLog(`🌬️ ${player.playerName} schleicht sich an... Vogel ist weggeflogen!`, 'fail');
            this.gameState.birdDiscard.push(birdId);
            this._replaceBird(birdId);

            // Draw compensatory insect
            if (this.gameState.insectDeck.length > 0) {
                player.hand.insects.push(this.gameState.insectDeck.shift());
                this.addToLog(`🐜 Trostpreis: Ein Insekt für den entgangenen ${bird ? bird.name : 'Vogel'}.`, 'action');
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

        // Target check
        if (!this.gameState.currentBirdId || this.gameState.currentBirdId != birdId) {
            return callback({ success: false, error: 'Du musst den Vogel zuerst auswählen!' });
        }

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
        this.addToLog(`✨ ${player.playerName} nutzt ${insect.card_type} (${insect.bonus_action})`, 'action');
        callback({ success: true, newDice: newVal });
        this.updateClients();
    }

    handleResolvePhoto(senderId, callback) {
        if (!this.gameState.pendingAction) return callback({ success: false, error: 'Keine Aktion ausstehend' });

        const action = this.gameState.pendingAction;
        const bird = this.gameState.visibleBirds.find(b => b.id === action.birdId);
        const player = this.players.find(p => p.playerId === senderId);

        const success = this._checkPhotoSuccess(action.diceValue, bird, this.gameState.currentDistance);

        if (success) {
            player.hand.birds.push(bird);
            player.score += bird.prestige_points;
            this._replaceBird(bird.id);
            this.addToLog(`📸 ${player.playerName} fotografiert den ${bird.name} (${bird.prestige_points} Pkt)!`, 'success');

            callback({ success: true, result: 'captured' });
        } else {
            this.gameState.birdDiscard.push(bird.id);
            this._replaceBird(bird.id);
            this.addToLog(`🌫️ ${player.playerName} verpasst den ${bird.name} (Würfel: ${action.diceValue})...`, 'fail');

            // Draw compensatory insect
            if (this.gameState.insectDeck.length > 0) {
                player.hand.insects.push(this.gameState.insectDeck.shift());
                this.addToLog(`🐜 Trostpreis: Ein Insekt für den entgangenen ${bird.name}.`, 'action');
            }

            callback({ success: true, result: 'scared' });
        }

        this.gameState.pendingAction = null;
        this.gameState.currentDistance = 0;
        this.gameState.currentBirdId = null;

        this.nextTurn();
        this.updateClients();
    }

    handleCaptureAll(insectIds, senderId, callback) {
        if (!this._isTurn(senderId) || !this.gameState.pendingAction) return callback({ success: false, error: 'Nicht dein Zug oder keine Aktion ausstehend' });

        const player = this.players.find(p => p.playerId === senderId);
        const action = this.gameState.pendingAction;

        // Verify: 3 insects of same type
        const usedInsects = player.hand.insects.filter(i => insectIds.includes(i.id));
        if (usedInsects.length !== 3) return callback({ success: false, error: 'Wähle genau 3 Insekten' });

        const firstType = usedInsects[0].card_type;
        const allSameType = usedInsects.every(i => i.card_type === firstType);
        if (!allSameType) return callback({ success: false, error: 'Die Insekten müssen vom gleichen Typ sein' });

        // Find all birds that match the dice roll at current distance
        const capturedBirds = [];
        this.gameState.visibleBirds.forEach(bird => {
            if (this._checkPhotoSuccess(action.diceValue, bird, this.gameState.currentDistance)) {
                capturedBirds.push(bird);
            }
        });

        if (capturedBirds.length === 0) {
            return callback({ success: false, error: 'Keine Vögel mit diesem Wurf erreichbar' });
        }

        // Award birds and consume insects
        player.hand.insects = player.hand.insects.filter(i => !insectIds.includes(i.id));
        capturedBirds.forEach(bird => {
            player.hand.birds.push(bird);
            player.score += bird.prestige_points;
            this._replaceBird(bird.id);
        });

        this.addToLog(`📸✨ ${player.playerName} nutzt Insekten-Power und fotografiert ${capturedBirds.length} Vögel auf einmal!`, 'success');

        this.gameState.pendingAction = null;
        this.gameState.currentDistance = 0;
        this.gameState.currentBirdId = null;

        this.nextTurn();
        this.updateClients();
        callback({ success: true, count: capturedBirds.length });
    }

    handleAttract(birdId, insectIds, senderId, callback) {
        if (!this._isTurn(senderId)) return callback({ success: false, error: 'Nicht dein Zug' });

        // Target check
        if (!this.gameState.currentBirdId || this.gameState.currentBirdId != birdId) {
            return callback({ success: false, error: 'Du musst den Vogel zuerst auswählen!' });
        }

        const player = this.players.find(p => p.playerId === senderId);
        const bird = this.gameState.visibleBirds.find(b => b.id === birdId);

        if (!bird) return callback({ success: false, error: 'Vogel nicht gefunden' });

        // Logic check: 2 matching insects of correct type
        const usedInsects = player.hand.insects.filter(i => insectIds.includes(i.id));
        const allCorrectType = usedInsects.every(i => i.card_type === bird.insect_type);

        if (usedInsects.length === 2 && allCorrectType) {
            player.hand.insects = player.hand.insects.filter(i => !insectIds.includes(i.id));
            player.hand.birds.push(bird);
            player.score += bird.prestige_points;
            this._replaceBird(bird.id);

            this.addToLog(`🦗 ${player.playerName} lockt den ${bird.name} erfolgreich an!`, 'success');

            this.gameState.currentDistance = 0;
            this.gameState.currentBirdId = null;
            this.nextTurn();
            this.updateClients();
            callback({ success: true });
        } else {
            callback({ success: false, error: 'Ungültige Insektenkarten' });
        }
    }

    handleSelectBird(birdId, senderId, callback) {
        if (!this._isTurn(senderId)) return callback({ success: false, error: 'Nicht dein Zug' });

        // Lock check: Once selected, cannot be changed
        if (this.gameState.currentBirdId && this.gameState.currentBirdId != birdId) {
            return callback({ success: false, error: 'Du schleichst dich bereits an einen anderen Vogel an!' });
        }

        if (this.gameState.currentBirdId === birdId) {
            return callback({ success: true, alreadySelected: true });
        }

        const bird = this.gameState.visibleBirds.find(b => b.id === birdId);
        if (!bird) return callback({ success: false, error: 'Vogel nicht gefunden' });

        this.gameState.currentBirdId = birdId;
        const player = this.players.find(p => p.playerId === senderId);

        // 1-Point Bird Bonus (only on first selection and only in Multi-player)
        if (this.rules.birdBonusEnabled && bird.prestige_points === 1 && this.players.length > 1) {
            if (this.gameState.insectDeck.length > 0) {
                const extraInsect = this.gameState.insectDeck.shift();
                player.hand.insects.push(extraInsect);
                this.addToLog(`🎁 Bonus: Eine extra Insektenkarte für das Ziel ${bird.name}!`, 'action');
            }
        } else if (bird.prestige_points === 1) {
            this.addToLog(`🎯 ${player.playerName} hat den ${bird.name} als Ziel gewählt.`, 'action');
        } else {
            this.addToLog(`🎯 ${player.playerName} hat den ${bird.name} als Ziel gewählt.`, 'action');
        }

        callback({ success: true });
        this.updateClients();
    }

    addBot(difficulty = 'easy', callback) {
        if (this.players.length >= 4) {
            return callback({ success: false, error: 'Raum ist voll' });
        }

        const botId = `bot_${Date.now()}`;

        let diffLabel = 'Leicht';
        if (difficulty === 'medium') diffLabel = 'Mittel';
        if (difficulty === 'hard') diffLabel = 'Profi';
        if (difficulty === 'legendary') diffLabel = 'Legendär';

        const botName = `Robo-Knipser ${this.players.length + 1} (${diffLabel})`;

        const botPlayer = {
            playerId: botId,
            playerName: botName,
            playerOrder: this.players.length,
            score: 0,
            hand: { insects: [], birds: [] },
            isBot: true,
            difficulty: difficulty
        };

        this.players.push(botPlayer);
        console.log(`[Host] Bot added (${difficulty}):`, botName, botId);

        this.bridge.broadcast('playerListUpdate', this.players.map(p => ({
            playerId: p.playerId,
            playerName: p.playerName,
            playerOrder: p.playerOrder,
            isBot: p.isBot
        })));

        callback({ success: true, playerId: botId });
    }

    nextTurn() {
        this.gameState.currentPlayerIndex = (this.gameState.currentPlayerIndex + 1) % this.players.length;
        this.gameState.currentDistance = 0;
        this.gameState.currentBirdId = null;

        if (this.gameState.birdDeck.length === 0 || this.gameState.insectDeck.length === 0) {
            this.endGame();
            return;
        }

        this.updateClients();

        const currentPlayer = this.players[this.gameState.currentPlayerIndex];

        // Broadcast new turn event
        // Note: Client usually updates based on gameStateUpdate, but we might need explicit turn event for animations
        // In current code, `updateClients` sends `gameStateUpdate` which includes `currentPlayerIndex`.
        // Let's check if there's a specific 'newTurn' event used elsewhere? 
        // Based on analysis, `updateClients` calling `broadcast('gameStateUpdate')` triggers UI updates.
        // However, I previously proposed `broadcast('newTurn')`. Let's stick to what exists if possible, 
        // or add it if needed. The original `nextTurn` just updated state.

        // Trigger Bot Turn if applicable
        if (currentPlayer.isBot) {
            setTimeout(() => this.playBotTurn(currentPlayer.playerId), 1500);
        }
    }

    playBotTurn(botId) {
        const bot = this.players.find(p => p.playerId === botId);
        if (!bot) return;

        console.log(`[Host] Bot ${bot.playerName} (Diff: ${bot.difficulty}) is thinking...`);

        // 1. Check for "Capture All" opportunity (All difficulties do this because it's cool)
        const insectCounts = {};
        bot.hand.insects.forEach(insect => {
            insectCounts[insect.type] = (insectCounts[insect.type] || 0) + 1;
        });

        let threeOfAKindType = null;
        for (const type in insectCounts) {
            if (insectCounts[type] >= 3) {
                threeOfAKindType = type;
                break;
            }
        }

        if (threeOfAKindType && this.gameState.visibleBirds.length > 0) {
            const insectsToUse = bot.hand.insects.filter(i => i.type === threeOfAKindType).slice(0, 3).map(i => i.id);
            console.log(`[Host] Bot ${bot.playerName} tries Capture All!`);
            this.handleCaptureAll(insectsToUse, botId, (res) => {
                if (!res.success) {
                    this._continueBotTurn(bot, botId);
                }
            });
            return;
        }

        this._continueBotTurn(bot, botId);
    }

    _continueBotTurn(bot, botId) {
        if (bot.difficulty === 'legendary') {
            this._playBotTurnLegendary(bot, botId);
        } else if (bot.difficulty === 'hard') {
            this._playBotTurnHard(bot, botId);
        } else if (bot.difficulty === 'medium') {
            this._playBotTurnMedium(bot, botId);
        } else {
            this._playBotTurnEasy(bot, botId);
        }
    }

    _playBotTurnLegendary(bot, botId) {
        // Legendary Strategy: "Master of Attraction"
        // Priority: Use "Attract" (2 insects) to capture high value birds (3+ points) WITHOUT rolling dice.
        // User confirmed max points is 3. So we target 3s.

        const highValueBirds = this.gameState.visibleBirds.filter(b => b.prestige_points >= 3);

        for (const bird of highValueBirds) {
            // Do we have 2 insects of the correct type?
            const matchingInsects = bot.hand.insects.filter(i => i.card_type === bird.insect_type);

            if (matchingInsects.length >= 2) {
                console.log(`[Host] Bot ${bot.playerName} (Legendary) uses Smart Attract on ${bird.name}!`);
                const insectIds = matchingInsects.slice(0, 2).map(i => i.id);

                // Use Attract to capture immediately
                // Note: handleAttract expects "birdId" (to capture) and "insectIds" (payment).
                // Wait, handleAttract logic in HostLogic.js:
                // "if (usedInsects.length === 2 && allCorrectType) { ... player.hand.birds.push(bird); ... }"
                // Yes, it captures the bird.

                this.handleSelectBird(bird.id, botId, (res) => {
                    if (res.success) {
                        this.handleAttract(bird.id, insectIds, botId, (res) => {
                            // If success using attract, turn is over (it calls nextTurn inside).
                        });
                    }
                });
                return;
            }
        }

        // Step 2: Fallback to Hard Logic (EV Maximization)
        this._playBotTurnHard(bot, botId);
    }

    _playBotTurnHard(bot, botId) {
        // Hard Bot Strategy: Expected Value Maximization
        // 1. Calculate EV for every visible bird (Score * Probability of Capture)
        // 2. Consider "Attract" if all EVs are low.

        const distance = this.gameState.currentDistance;
        let bestMove = { type: 'wait', value: 0 };

        // Evaluate Birds
        let bestBird = null;
        let maxEV = -1;

        this.gameState.visibleBirds.forEach(bird => {
            const prob = this._calculateCaptureProbability(bird, distance, bot.hand.insects);
            const ev = bird.prestige_points * prob;

            if (ev > maxEV) {
                maxEV = ev;
                bestBird = bird;
            }
        });

        // Thresholds
        // If Max EV is very low (< 0.5) and we have insects, Attract might be better (EV ~ ? Unknown but potentially higher next turn)
        // Sneak EV = 0.66 * (Ev at distance+1) - roughly.

        if (!bestBird || (maxEV < 1.0 && bot.hand.insects.length > 1 && this.gameState.birdDeckCount > 0)) {
            // Board is trash, flush it
            this._botAttract(bot, botId);
            return;
        }

        // Decision: Sneak vs Photo
        // Compare EV of Photo Now vs EV of Sneak (Success chance * EV at next distance)
        const photoProb = this._calculateCaptureProbability(bestBird, distance, bot.hand.insects);
        const photoEV = bestBird.prestige_points * photoProb;

        // Estimate Sneak EV
        // Sneak success = 4/6 = 0.66
        // Next distance EV roughly estimated (simplified)
        // If dist=2, next is max, so Sneak EV is 0.
        // If dist<2, next dist prob is likely higher.

        let sneakEV = 0;
        if (distance < 2) {
            const nextDistProb = this._calculateCaptureProbability(bestBird, distance + 1, bot.hand.insects);
            sneakEV = 0.66 * (bestBird.prestige_points * nextDistProb);
            // Discount slightly for turn delay? No, keep it simple.
        }

        console.log(`[Host] Bot ${bot.playerName} Analysis: BestBird=${bestBird.name}, PhotoEV=${photoEV.toFixed(2)}, SneakEV=${sneakEV.toFixed(2)}`);

        if (photoEV >= sneakEV && photoProb > 0.3) {
            // Take Photo if better EV and at least decent chance (don't waste turn on 5% yolo unless sneak is worse)
            this._botTakePhoto(bot, botId, bestBird, distance, true);
        } else {
            // If sneak is better, or photo is terrible
            // But if dist=2, we MUST photo (sneakEV is 0).
            if (distance === 2) {
                this._botTakePhoto(bot, botId, bestBird, distance, true);
            } else {
                this._botSneak(bot, botId, bestBird);
            }
        }
    }

    _calculateCaptureProbability(bird, distance, insects) {
        // 1. Get requirements
        let req;
        if (distance === 0) req = bird.distance_far_dice;
        if (distance === 1) req = bird.distance_mid_dice;
        if (distance === 2) req = bird.distance_near_dice;
        if (!req) return 0;

        // 2. Base Probability (Dice only)
        let winningRolls = 0;

        // 3. Insect Boost
        // How many rolls can be FIXED by our insects?
        // We simulate all 6 dice rolls.

        for (let roll = 1; roll <= 6; roll++) {
            let success = false;

            // Check raw roll
            if (this._checkRollMatch(roll, req)) {
                success = true;
            } else {
                // Check if any insect fixes it
                for (const insect of insects) {
                    let mod = roll;
                    if (insect.bonus_action === 'increase') mod = Math.min(6, roll + 1);
                    if (insect.bonus_action === 'decrease') mod = Math.max(1, roll - 1);
                    if (insect.bonus_action === 'flip') mod = 7 - roll;

                    if (this._checkRollMatch(mod, req)) {
                        success = true;
                        break; // Found a fix
                    }
                }
            }

            if (success) winningRolls++;
        }

        return winningRolls / 6.0;
    }

    _checkRollMatch(val, req) {
        if (req.includes('-')) {
            const [min, max] = req.split('-').map(Number);
            return val >= min && val <= max;
        } else {
            return val === parseInt(req);
        }
    }

    _playBotTurnEasy(bot, botId) {
        const bird = this.gameState.visibleBirds[0];

        if (!bird) {
            this._botAttract(bot, botId);
            return;
        }

        const distance = this.gameState.currentDistance;
        const roll = Math.random();

        // Simple Decision Logic (Random/Aggressive)
        let takePhoto = false;
        if (distance === 2) takePhoto = true;
        else if (distance === 1 && roll > 0.3) takePhoto = true;
        else if (distance === 0 && roll > 0.7) takePhoto = true;

        if (takePhoto) {
            this._botTakePhoto(bot, botId, bird, distance, false); // False = No items
        } else {
            this._botSneak(bot, botId, bird);
        }
    }

    _playBotTurnMedium(bot, botId) {
        // Medium Bot Strategy:
        // 1. Target Selection: Pick the easiest bird or most valuable if easy.
        //    (For simplicity, currently we only engage the active bird if one is selected, 
        //     but in this game you target *a* bird. The game state has 'currentBirdId' only during sneak/photo sequence.
        //     Actually, 'visibleBirds' are all targets. 
        //     But wait, 'Sneak' targets a specific bird? 'handleSneak' takes birdId.
        //     So we can choose ANY bird to start on.
        //     Easy bot always took [0]. Medium should check all.)

        // Find best target
        let bestBird = null;
        let bestScore = -1;

        // Simple heuristic: Points / Difficulty
        // Difficulty estimate: distance_near_dice count (simplified)
        // Actually, just prioritize points for now.
        // Or stick to bird[0] to keep it snappy, but use items.
        // Let's iterate and find the first one that matches our hand? No, hand is for bonuses.

        // Strategy: Stick to bird[0] for consistency unless we can't catch it?
        // Let's just pick the bird with most points.
        this.gameState.visibleBirds.forEach(bird => {
            if (!bestBird || bird.prestige_points > bestBird.prestige_points) {
                bestBird = bird;
            }
        });

        if (!bestBird) {
            this._botAttract(bot, botId);
            return;
        }

        const distance = this.gameState.currentDistance;

        // Decision: Photo vs Sneak
        // If we are close (2), Photo.
        // If we are mid (1), Photo.
        // If we are far (0), Sneak (unless we have a perfect dice match guarantee? No, we don't know roll yet).

        let takePhoto = false;
        if (distance >= 1) takePhoto = true; // More aggressive on Photo if steps taken
        else takePhoto = false; // Always sneak at start (safest)

        if (takePhoto) {
            this._botTakePhoto(bot, botId, bestBird, distance, true); // True = Use Items
        } else {
            this._botSneak(bot, botId, bestBird);
        }
    }

    _botAttract(bot, botId) {
        // Find any bird the bot can attract (has 2 matching insects)
        for (const bird of this.gameState.visibleBirds) {
            const matchingInsects = bot.hand.insects.filter(i => i.card_type === bird.insect_type);
            if (matchingInsects.length >= 2) {
                const insectIds = [matchingInsects[0].id, matchingInsects[1].id];
                console.log(`[Host] Bot ${bot.playerName} selects and attracts ${bird.name}.`);

                // Bot must select first
                this.handleSelectBird(bird.id, botId, (res) => {
                    if (res.success) {
                        this.handleAttract(bird.id, insectIds, botId, () => { });
                    }
                });
                return;
            }
        }

        // If it can't attract anything, just skip/next turn (or maybe it shouldn't be here)
        console.log(`[Host] Bot ${bot.playerName} wanted to attract but cannot afford anything.`);
        this.nextTurn();
        this.updateClients();
    }

    _botSneak(bot, botId, bird) {
        console.log(`[Host] Bot ${bot.playerName} selects and sneaks on ${bird.name}.`);

        this.handleSelectBird(bird.id, botId, (res) => {
            if (res.success) {
                this.handleSneak(bird.id, false, null, botId, (res) => {
                    if (res.success && res.result === 'success') {
                        setTimeout(() => this.playBotTurn(botId), 1500);
                    } else if (res.success) {
                        // Sneak failed (scared) or other result - handled inside handleSneak (nextTurn)
                    } else {
                        console.error(`[Host] Bot ${bot.playerName} Sneak failed:`, res.error);
                        this.nextTurn();
                    }
                });
            } else {
                console.error(`[Host] Bot ${bot.playerName} Selection failed:`, res.error);
                this.nextTurn();
            }
        });
    }

    _botTakePhoto(bot, botId, bird, distance, useItems) {
        console.log(`[Host] Bot ${bot.playerName} selects and takes a photo of ${bird.name}!`);

        this.handleSelectBird(bird.id, botId, (res) => {
            if (res.success) {
                this.handleStartPhotoRoll(bird.id, botId, (rollResult) => {
                    if (rollResult.success) {
                        const diceValue = rollResult.diceValue;
                        let isSuccess = this._checkPhotoSuccess(diceValue, bird, distance);

                        if (!isSuccess && useItems) {
                            // Try to fix it with insects
                            const insect = this._findHelpfulInsect(bot, diceValue, bird, distance);
                            if (insect) {
                                console.log(`[Host] Bot ${bot.playerName} uses ${insect.card_type} to fix roll!`);
                                this.handleApplyBonus(insect.id, botId, (res) => {
                                    setTimeout(() => {
                                        this.handleResolvePhoto(botId, (res) => { });
                                    }, 1500);
                                });
                                return;
                            }
                        }

                        setTimeout(() => {
                            this.handleResolvePhoto(botId, (res) => { });
                        }, 1500);
                    } else {
                        console.error(`[Host] Bot ${bot.playerName} Photo Roll failed:`, rollResult.error);
                        this.nextTurn();
                    }
                });
            } else {
                console.error(`[Host] Bot ${bot.playerName} Selection failed:`, res.error);
                this.nextTurn();
            }
        });
    }

    _findHelpfulInsect(bot, currentDice, bird, distance) {
        // Try each insect
        for (const insect of bot.hand.insects) {
            let modDice = currentDice;
            if (insect.bonus_action === 'increase') modDice = Math.min(6, currentDice + 1);
            if (insect.bonus_action === 'decrease') modDice = Math.max(1, currentDice - 1);
            if (insect.bonus_action === 'flip') modDice = 7 - currentDice;
            // Skip reroll for simplicity (too random)

            if (this._checkPhotoSuccess(modDice, bird, distance)) {
                return insect;
            }
        }
        return null;
    }

    endGame() {
        this.gameState.status = 'finished';
        this.addToLog(`🏆 Das Spiel ist beendet!`, 'turn');

        const finalScores = this.players.map(p => {
            const birds = p.hand.birds;
            const p1 = birds.filter(b => b.prestige_points === 1).length;
            const p2 = birds.filter(b => b.prestige_points === 2).length;
            const p3 = birds.filter(b => b.prestige_points === 3).length;

            // New Bonus Rule: +1 Point for each 1P card more than 3P cards
            const bonus = Math.max(0, p1 - p3);
            const totalScore = p.score + bonus;

            return {
                playerId: p.playerId,
                playerName: p.playerName,
                score: totalScore, // Total including bonus
                breakdown: {
                    p1: p1 * 1,
                    p2: p2 * 2,
                    p3: p3 * 3,
                    bonus: bonus,
                    counts: { p1, p2, p3 }
                }
            };
        });

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
                score: p.score,
                insectCount: p.hand.insects.length
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
