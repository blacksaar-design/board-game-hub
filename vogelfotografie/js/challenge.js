/**
 * Challenge Mode – Herausforderungsmodus
 * 4 aufeinanderfolgende Spiele, je ein Ziel + Automa (Meister) schlagen.
 */

const CHALLENGE_GOALS = [
    {
        id: 'no_3pt',
        icon: '🚫🦅',
        title: 'Ohne 3er-Vögel',
        description: 'Gewinne, ohne einen einzigen 3-Prestige-Vogel fotografiert zu haben.',
        check: (playerEntry, automaEntry) => {
            return playerEntry.breakdown.counts.p3 === 0 && playerEntry.score > automaEntry.score;
        }
    },
    {
        id: 'three_sets',
        icon: '🦋🦋🦋',
        title: 'Drei Insekten-Sets',
        description: 'Gewinne mit mindestens 3 Insekten-Sets (3er- oder 4er-Sets).',
        check: (playerEntry, automaEntry) => {
            const adv = playerEntry.breakdown.advanced;
            const sets = (adv ? adv.s3 + adv.s4 : 0);
            return sets >= 3 && playerEntry.score > automaEntry.score;
        }
    },
    {
        id: 'martin_minus',
        icon: '🐦➖3',
        title: 'Drei weniger als Martin',
        description: 'Gewinne mit mindestens 3 Vögeln weniger als der Automa (Martin).',
        check: (playerEntry, automaEntry) => {
            const diff = (automaEntry.birds ? automaEntry.birds.length : 0) - (playerEntry.birds ? playerEntry.birds.length : 0);
            return diff >= 3 && playerEntry.score > automaEntry.score;
        }
    },
    {
        id: 'no_s4',
        icon: '🎯',
        title: 'Ohne 4er-Set',
        description: 'Gewinne, ohne ein 4er-Set aus 4 verschiedenen Insektentypen zu bilden.',
        check: (playerEntry, automaEntry) => {
            const adv = playerEntry.breakdown.advanced;
            return (adv ? adv.s4 === 0 : true) && playerEntry.score > automaEntry.score;
        }
    }
];

const STORAGE_KEY = 'vogel_challenge_state';

class ChallengeManager {
    constructor() {
        this._load();
    }

    _load() {
        try {
            const saved = sessionStorage.getItem(STORAGE_KEY);
            if (saved) {
                const s = JSON.parse(saved);
                this.active = s.active || false;
                this.completedGoalIds = s.completedGoalIds || [];
                this.gameCount = s.gameCount || 0;
            } else {
                this._reset();
            }
        } catch (e) {
            this._reset();
        }
    }

    _save() {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
            active: this.active,
            completedGoalIds: this.completedGoalIds,
            gameCount: this.gameCount
        }));
    }

    _reset() {
        this.active = false;
        this.completedGoalIds = [];
        this.gameCount = 0;
    }

    start() {
        this._reset();
        this.active = true;
        this._save();
    }

    abort() {
        this._reset();
        this._save();
    }

    getRemainingGoals() {
        return CHALLENGE_GOALS.filter(g => !this.completedGoalIds.includes(g.id));
    }

    getGoalById(id) {
        return CHALLENGE_GOALS.find(g => g.id === id);
    }

    /**
     * Evaluates a finished game. Returns { metGoals, beatAutoma }.
     * playerEntry and automaEntry are from finalScores array.
     */
    evaluateGame(finalScores) {
        // Restrict to the human player only (not automa, not other bots)
        const automaEntry = finalScores.find(s => s.playerId === 'automa');
        // Pick first non-automa player as the human
        const playerEntry = finalScores.find(s => s.playerId !== 'automa');

        if (!playerEntry || !automaEntry) {
            return { metGoals: [], beatAutoma: false };
        }

        const beatAutoma = playerEntry.score > automaEntry.score;
        const remaining = this.getRemainingGoals();
        const metGoals = remaining.filter(g => {
            try { return g.check(playerEntry, automaEntry); } catch (e) { return false; }
        });

        return { metGoals, beatAutoma, playerEntry, automaEntry };
    }

    completeGoal(goalId) {
        if (!this.completedGoalIds.includes(goalId)) {
            this.completedGoalIds.push(goalId);
            this.gameCount++;
            this._save();
        }
    }

    isComplete() {
        return this.completedGoalIds.length >= 4;
    }
}

window.Challenge = {
    Manager: new ChallengeManager(),
    GOALS: CHALLENGE_GOALS
};
