class NetworkManager {
    constructor() {
        this.peer = null;
        this.conn = null;
        this.isHost = false;
        this.myPlayerId = null;
        this.otherPlayerId = null; // In 2 player 1v1

        // Callbacks
        this.onConnected = null;
        this.onData = null;
        this.onPeerError = null;
    }

    // Initialize as Host
    initHost(callback) {
        this.isHost = true;
        this.peer = new Peer(this.generateRoomCode());

        this.peer.on('open', (id) => {
            console.log('✅ Host initialized with ID:', id);
            this.myPlayerId = id;
            if (callback) callback(id);
        });

        this.peer.on('connection', (conn) => {
            console.log('👋 New connection request from:', conn.peer);
            this.handleConnection(conn);
        });

        this.peer.on('error', (err) => {
            console.error('Peer error:', err);
            if (this.onPeerError) this.onPeerError(err);
        });
    }

    // Initialize as Client and connect to Host
    joinGame(hostId, callback) {
        this.isHost = false;
        this.peer = new Peer(); // Auto-generate ID

        this.peer.on('open', (id) => {
            console.log('✅ Client initialized with ID:', id);
            this.myPlayerId = id;

            // Connect to host
            console.log('Connecting to host:', hostId);
            const conn = this.peer.connect(hostId);
            this.handleConnection(conn);

            if (callback) callback(id);
        });

        this.peer.on('error', (err) => {
            console.error('Peer error:', err);
            if (this.onPeerError) this.onPeerError(err);
        });
    }

    handleConnection(conn) {
        this.conn = conn;

        this.conn.on('open', () => {
            console.log('🚀 Connection established!');
            if (this.onConnected) this.onConnected(this.conn.peer);
        });

        this.conn.on('data', (data) => {
            // console.log('📥 Received data:', data);
            if (this.onData) this.onData(data);
        });

        this.conn.on('close', () => {
            console.log('❌ Connection closed');
            // Handle disconnect
        });

        this.conn.on('error', (err) => {
            console.error('Connection error:', err);
        });
    }

    send(type, payload) {
        if (this.conn && this.conn.open) {
            this.conn.send({ type, payload });
        } else {
            console.warn('⚠️ Cannot send data, connection not open');
        }
    }

    generateRoomCode() {
        // Generate a 4-letter code for easier sharing
        // PeerJS IDs must be unique globally, so we might need a prefix
        // For this demo, we use a random 6-char string and hope for no collisions
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 4; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return 'VOGEL-' + code;
    }
}

window.Network = new NetworkManager();
