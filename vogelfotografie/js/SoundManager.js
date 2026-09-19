/**
 * SoundManager.js – Vogelfotografie
 * Synthetisch erzeugte Sounds via Web Audio API.
 * Kein Laden externer Dateien nötig.
 */
class SoundManager {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this._init();
    }

    _init() {
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('[Sound] Web Audio API not supported.');
            this.enabled = false;
        }
    }

    _resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    /** Basisklang: Oszillator mit Hüllkurve */
    _playTone(freq, type = 'sine', duration = 0.3, volume = 0.3, startTime = 0) {
        if (!this.enabled || !this.ctx) return;
        this._resume();

        const t = this.ctx.currentTime + startTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);

        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(volume, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

        osc.start(t);
        osc.stop(t + duration);
    }

    /** Rauschen (für Schuss-Kamera-Klick) */
    _playNoise(duration = 0.1, volume = 0.15, startTime = 0) {
        if (!this.enabled || !this.ctx) return;
        this._resume();

        const t = this.ctx.currentTime + startTime;
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1);
        }

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;

        const gain = this.ctx.createGain();
        source.connect(gain);
        gain.connect(this.ctx.destination);

        gain.gain.setValueAtTime(volume, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

        source.start(t);
    }

    // ── PUBLIC SOUNDS ────────────────────────────────────────────────────────

    /** 📷 Foto geschossen (Kamera-Klick) */
    playPhotoClick() {
        this._playNoise(0.05, 0.3);
        this._playTone(1800, 'sine', 0.08, 0.2, 0.03);
        this._playTone(900, 'sine', 0.12, 0.15, 0.07);
    }

    /** ✅ Vogel erfolgreich fotografiert */
    playCaptureSuccess() {
        // Aufsteigende Akkord-Fanfare
        this._playTone(523, 'sine', 0.15, 0.3, 0.0);  // C5
        this._playTone(659, 'sine', 0.15, 0.3, 0.1);  // E5
        this._playTone(784, 'sine', 0.2, 0.35, 0.2);  // G5
        this._playTone(1046, 'sine', 0.35, 0.3, 0.32); // C6
    }

    /** 📸✨ Mega-Foto (Alle fotografieren) */
    playMegaCapture() {
        // Reichhaltigerer Klang
        [523, 659, 784, 1046].forEach((freq, i) => {
            this._playTone(freq, 'triangle', 0.4, 0.25, i * 0.06);
        });
        this._playTone(1318, 'sine', 0.5, 0.3, 0.28); // E6
    }

    /** 💨 Vogel weggeflogen / Foto misslungen */
    playFail() {
        this._playTone(400, 'sawtooth', 0.12, 0.25, 0.0);
        this._playTone(300, 'sawtooth', 0.15, 0.2, 0.1);
        this._playTone(200, 'sawtooth', 0.2, 0.15, 0.22);
    }

    /** 🚶 Anschleichen (sanfter Schritt-Sound) */
    playSneak() {
        this._playTone(200, 'sine', 0.1, 0.15, 0.0);
        this._playTone(250, 'sine', 0.1, 0.12, 0.12);
    }

    /** 🎲 Würfel rollt (klackernd) */
    playDiceRoll() {
        // Mehrere kurze Klick-Sounds
        for (let i = 0; i < 6; i++) {
            const delay = i * 0.08;
            const pitch = 600 + Math.random() * 400;
            this._playNoise(0.04, 0.2 - i * 0.02, delay);
            this._playTone(pitch, 'square', 0.04, 0.08, delay);
        }
    }

    /** 🦗 Vogel angelockt */
    playAttract() {
        // Zirpen-ähnlich
        this._playTone(1200, 'sine', 0.05, 0.2, 0.0);
        this._playTone(1400, 'sine', 0.05, 0.2, 0.07);
        this._playTone(1200, 'sine', 0.05, 0.2, 0.14);
        this._playTone(1600, 'sine', 0.15, 0.25, 0.21);
    }

    /** 🔔 Neuer Zug (sanftes Ping) */
    playNewTurn() {
        this._playTone(880, 'sine', 0.25, 0.2, 0.0);
        this._playTone(1100, 'sine', 0.2, 0.15, 0.15);
    }

    /** 🏆 Spiel beendet */
    playGameEnd() {
        const melody = [523, 659, 784, 659, 784, 1046];
        melody.forEach((freq, i) => {
            this._playTone(freq, 'triangle', 0.25, 0.3, i * 0.18);
        });
    }

    /** 🎯 Vogel ausgewählt */
    playSelectBird() {
        this._playTone(660, 'sine', 0.1, 0.15);
        this._playTone(880, 'sine', 0.12, 0.12, 0.08);
    }

    /** ✨ Insektenkarte angewandt */
    playInsectBonus() {
        this._playTone(800, 'triangle', 0.08, 0.2, 0.0);
        this._playTone(1000, 'triangle', 0.08, 0.2, 0.06);
        this._playTone(1200, 'triangle', 0.15, 0.2, 0.12);
    }
}

// Globale Instanz
window.Sounds = new SoundManager();
