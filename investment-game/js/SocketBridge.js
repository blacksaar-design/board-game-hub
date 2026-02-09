/**
 * SocketBridge.js - PeerJS based Socket.io emulator (Generic Version)
 */

class SocketBridge {
    constructor(hostClass) {
        this.handlers = {};
        this.peer = null;
        this.connections = [];
        this.conn = null;
        this.isHost = false;
        this.playerId = 'p_' + Math.random().toString(36).substr(2, 9);
        this.roomCode = null;
        this.hostLogic = null;
        this.HostClass = hostClass; // The class to instantiate if we are host
        this.callbacks = {};
    }

    on(event, handler) {
        if (!this.handlers[event]) this.handlers[event] = [];
        this.handlers[event].push(handler);
    }

    emit(event, ...args) {
        const callback = typeof args[args.length - 1] === 'function' ? args.pop() : null;
        const data = args[0];

        // console.log(`[SocketBridge] Emitting: ${event}`, data);

        // Intercept Room Creation/Joining
        if (['createRoom', 'create-game'].includes(event)) {
            this.createRoom(data, callback);
            return;
        }

        if (['joinRoom', 'join-game'].includes(event)) {
            const code = data.roomCode || data.gameId || args[0];
            const name = data.playerName || args[1];
            this.joinRoom(code, name, callback);
            return;
        }

        // Send to host if we are a client
        if (!this.isHost && this.conn) {
            this.conn.send({
                type: 'event',
                event,
                data,
                hasCallback: !!callback,
                callbackId: this._registerCallback(callback)
            });
        }
        // Send to self/other clients if we are host
        else if (this.isHost) {
            this.hostLogic.handleEvent(event, data, (res) => {
                if (callback) callback(res);
            }, this.playerId);
        }
    }

    async createRoom(playerName, callback) {
        this.isHost = true;
        // Generate a 6-char room code
        this.roomCode = Math.random().toString(36).substr(2, 6).toUpperCase();

        this.hostLogic = new this.HostClass(this);
        if (this.hostLogic.init) await this.hostLogic.init();

        this.peer = new Peer(this.roomCode);

        this.peer.on('open', (id) => {
            this._updateStatus(true, 'Host active');
            // Host joins their own room
            this.hostLogic.addPlayer(this.playerId, typeof playerName === 'object' ? playerName.playerName : playerName, (res) => {
                callback({ success: true, roomCode: this.roomCode, gameId: this.roomCode, playerId: this.playerId, state: this.hostLogic.getState() });
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
            callback({ success: false, error: 'Failed to create room: ' + err.type });
        });
    }

    joinRoom(roomCode, playerName, callback) {
        this.isHost = false;
        this.roomCode = roomCode;
        this.peer = new Peer();

        this.peer.on('open', (id) => {
            this.conn = this.peer.connect(roomCode);

            this.conn.on('open', () => {
                this._updateStatus(true, 'Connected to host');

                // Send join event
                this.emit('joinRoomInternal', { playerName, playerId: this.playerId }, (res) => {
                    if (res && res.success) {
                        this.playerId = res.playerId;
                    }
                    if (callback) callback(res);
                });
            });

            this.conn.on('data', (data) => this._handleInboundData(data, this.conn));
            this.conn.on('close', () => {
                this._updateStatus(false, 'Disconnected');
                alert('Connection to host lost.');
                location.reload();
            });
        });

        this.peer.on('error', (err) => {
            console.error('[SocketBridge] Peer Error:', err);
            if (callback) callback({ success: false, error: 'Failed to connect to room.' });
        });
    }

    _handleInboundData(data, conn) {
        if (data.type === 'event') {
            if (this.isHost) {
                this.hostLogic.handleEvent(data.event, data.data, (res) => {
                    if (data.hasCallback) {
                        conn.send({ type: 'callback', callbackId: data.callbackId, response: res });
                    }
                }, conn.peer);
            } else {
                this._triggerLocalHandlers(data.event, data.data);
            }
        } else if (data.type === 'callback') {
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
        this._triggerLocalHandlers(event, data);
        if (this.isHost) {
            this.connections.forEach(conn => {
                if (conn.open) {
                    conn.send({ type: 'event', event, data });
                }
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
        const id = 'cb_' + Math.random().toString(36).substr(2, 9);
        this.callbacks[id] = cb;
        return id;
    }

    // Mock property for game compatibility
    get id() {
        return this.playerId;
    }
}

// Factory for game implementation
window.initializeP2P = (HostClass) => {
    const bridge = new SocketBridge(HostClass);
    window.io = () => bridge;
    return bridge;
};
