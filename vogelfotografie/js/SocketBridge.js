/**
 * SocketBridge.js - PeerJS based Socket.io emulator
 * Allows running Vogelfotografie without a backend server.
 */

class SocketBridge {
    constructor() {
        this.handlers = {};
        this.peer = null;
        this.connections = []; // Array of connections (for host)
        this.conn = null;      // Single connection (for client)
        this.isHost = false;
        this.playerId = 'p_' + Math.random().toString(36).substr(2, 9);
        this.roomCode = null;
        this.hostLogic = null; // Will be initialized if this instance is host
    }

    on(event, handler) {
        if (!this.handlers[event]) this.handlers[event] = [];
        this.handlers[event].push(handler);
    }

    emit(event, ...args) {
        const callback = typeof args[args.length - 1] === 'function' ? args.pop() : null;
        const data = args[0];

        console.log(`[SocketBridge] Emitting: ${event}`, data);

        // Intercept local actions
        if (event === 'createRoom') {
            this.createRoom(data, callback);
            return;
        }

        if (event === 'joinRoom') {
            this.joinRoom(data.roomCode || args[0], data.playerName || args[1], callback);
            return;
        }

        // Send to host if we are a client
        if (!this.isHost && this.conn) {
            this.conn.send({ type: 'event', event, data, hasCallback: !!callback, callbackId: this._registerCallback(callback) });
        }
        // Send to self/other clients if we are host
        else if (this.isHost) {
            this.hostLogic.handleEvent(event, data, (res) => {
                if (callback) callback(res);
            }, this.playerId);
        }
    }

    // INTERNAL P2P LOGIC

    async createRoom(playerName, callback) {
        this.isHost = true;
        this.roomCode = 'VOGEL-' + Math.random().toString(36).substr(2, 4).toUpperCase();

        // Initialize Host Logic
        this.hostLogic = new VogelfotografieHost(this);
        await this.hostLogic.init();

        this.peer = new Peer(this.roomCode);

        this.peer.on('open', (id) => {
            console.log('[SocketBridge] Host Peer ID:', id);
            this._updateStatus(true, 'Host aktiv - Warte auf Spieler');

            // Host joins their own room
            this.hostLogic.addPlayer(this.playerId, playerName, (res) => {
                callback({ success: true, roomCode: this.roomCode, playerId: this.playerId });
            });
        });

        this.peer.on('connection', (conn) => {
            this.connections.push(conn);
            conn.on('data', (data) => this._handleInboundData(data, conn));
            conn.on('close', () => {
                this.connections = this.connections.filter(c => c !== conn);
            });
        });

        this.peer.on('error', (err) => {
            console.error('[SocketBridge] Peer Error:', err);
            callback({ success: false, error: 'Raum konnte nicht erstellt werden: ' + err.type });
        });
    }

    joinRoom(roomCode, playerName, callback) {
        this.isHost = false;
        this.roomCode = roomCode;
        this.peer = new Peer();

        this.peer.on('open', (id) => {
            this.conn = this.peer.connect(roomCode);

            this.conn.on('open', () => {
                console.log('[SocketBridge] Connected to host');
                this._updateStatus(true, 'Verbunden mit Host');

                // Send join event
                this.emit('joinRoomInternal', { playerName, playerId: this.playerId }, (res) => {
                    if (res.success) {
                        this.playerId = res.playerId;
                        callback(res);
                    } else {
                        callback(res);
                    }
                });
            });

            this.conn.on('data', (data) => this._handleInboundData(data, this.conn));
            this.conn.on('close', () => {
                this._updateStatus(false, 'Verbindung zum Host verloren');
                alert('Die Verbindung zum Spielleiter wurde unterbrochen.');
                location.reload();
            });
        });

        this.peer.on('error', (err) => {
            console.error('[SocketBridge] Peer Error:', err);
            callback({ success: false, error: 'Verbindung zum Raum fehlgeschlagen.' });
        });
    }

    _handleInboundData(data, conn) {
        if (data.type === 'event') {
            if (this.isHost) {
                // Host receives event from client
                this.hostLogic.handleEvent(data.event, data.data, (res) => {
                    if (data.hasCallback) {
                        conn.send({ type: 'callback', callbackId: data.callbackId, response: res });
                    }
                }, conn.peer); // Use peer ID as identifier
            } else {
                // Client receives shared event from host
                this._triggerLocalHandlers(data.event, data.data);
            }
        } else if (data.type === 'callback') {
            // Client receives response to their emission
            const cb = this.callbacks[data.callbackId];
            if (cb) {
                cb(data.response);
                delete this.callbacks[data.callbackId];
            }
        }
    }

    _triggerLocalHandlers(event, data) {
        if (this.handlers[event]) {
            this.handlers[event].forEach(h => h(data));
        }
    }

    broadcast(event, data) {
        // Send to local handlers
        this._triggerLocalHandlers(event, data);

        // Send to all connected peers
        if (this.isHost) {
            this.connections.forEach(conn => {
                conn.send({ type: 'event', event, data });
            });
        }
    }

    _updateStatus(online, text) {
        const dot = document.getElementById('statusDot');
        const label = document.getElementById('statusText');
        if (dot) dot.style.background = online ? '#50C878' : '#FF6B9D';
        if (label) label.innerText = text;
    }

    _registerCallback(cb) {
        if (!cb) return null;
        if (!this.callbacks) this.callbacks = {};
        const id = 'cb_' + Math.random().toString(36).substr(2, 9);
        this.callbacks[id] = cb;
        return id;
    }
}

// Global instance to replace socket.io
window.io = () => new SocketBridge();
