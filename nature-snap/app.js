/**
 * Nature Snap - Core Logic
 */

const state = {
    stream: null,
    isProcessing: false,
    collection: JSON.parse(localStorage.getItem('nature_collection') || '[]'),
    mockAnimals: [
        { name: 'Red Fox', rarity: 'Rare', baseScore: 850 },
        { name: 'Common Blackbird', rarity: 'Common', baseScore: 120 },
        { name: 'European Rabbit', rarity: 'Common', baseScore: 250 },
        { name: 'Roe Deer', rarity: 'Uncommon', baseScore: 540 },
        { name: 'Red Squirrel', rarity: 'Uncommon', baseScore: 480 },
        { name: 'Great Spotted Woodpecker', rarity: 'Rare', baseScore: 920 }
    ]
};

// DOM Elements
const video = document.getElementById('camera-stream');
const canvas = document.getElementById('capture-canvas');
const snapBtn = document.getElementById('snap-btn');
const overlay = document.getElementById('result-overlay');
const closeBtn = document.getElementById('close-result');
const natureDex = document.getElementById('nature-dex');
const dexTab = document.getElementById('dex-tab');
const cameraTab = document.getElementById('camera-tab');
const collectionGrid = document.getElementById('collection-grid');
const countdownStatus = document.getElementById('tracking-status');

/**
 * Initialize Camera
 */
async function initCamera() {
    try {
        const constraints = {
            video: {
                facingMode: 'environment', // Use back camera
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        };
        state.stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = state.stream;
    } catch (err) {
        console.error("Camera Error:", err);
        alert("Please enable camera access to play Nature Snap!");
    }
}

/**
 * Capture Photo
 */
function captureSnapshot() {
    if (state.isProcessing) return;

    state.isProcessing = true;
    snapBtn.style.opacity = "0.5";
    countdownStatus.innerText = "CAPTURING...";

    // Draw frame to canvas
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    const imageData = canvas.toDataURL('image/jpeg');

    // Simulate AI Identification Delay
    setTimeout(() => {
        const result = identifyAnimal(imageData);
        showResult(result, imageData);
        state.isProcessing = false;
        snapBtn.style.opacity = "1";
        countdownStatus.innerText = "READY FOR SCAN";
    }, 1500);
}

/**
 * Mock Identification Logic
 * In a real app, this would call a Vision API
 */
function identifyAnimal(image) {
    const randomIndex = Math.floor(Math.random() * state.mockAnimals.length);
    const animal = state.mockAnimals[randomIndex];

    // Add some random variation to score
    const qualityBonus = Math.floor(Math.random() * 200);
    const totalScore = animal.baseScore + qualityBonus;

    return {
        ...animal,
        score: totalScore,
        id: Date.now()
    };
}

/**
 * Show Result Overlay
 */
function showResult(result, imageData) {
    document.getElementById('result-image-preview').style.backgroundImage = `url(${imageData})`;
    document.getElementById('result-name').innerText = result.name;
    document.getElementById('result-rarity').innerText = result.rarity.toUpperCase();
    document.getElementById('result-score').innerText = result.score;

    overlay.classList.remove('hidden');

    state.currentResult = { ...result, image: imageData };
}

/**
 * Save to Collection
 */
function saveToCollection() {
    if (state.currentResult) {
        state.collection.push(state.currentResult);
        localStorage.setItem('nature_collection', JSON.stringify(state.collection));
        updateDexUI();
    }
    overlay.classList.add('hidden');
}

/**
 * Update Dex UI
 */
function updateDexUI() {
    collectionGrid.innerHTML = '';
    document.getElementById('total-caught').innerText = `Collection: ${state.collection.length}`;

    state.collection.slice().reverse().forEach(item => {
        const el = document.createElement('div');
        el.className = 'dex-item';
        el.innerHTML = `
            <div class="dex-img" style="background-image: url(${item.image})"></div>
            <div class="dex-info">
                <div class="dex-name">${item.name}</div>
                <div class="dex-score">${item.score} PTS</div>
            </div>
        `;
        collectionGrid.appendChild(el);
    });
}

/**
 * Navigation
 */
function toggleTab(tab) {
    if (tab === 'dex') {
        natureDex.classList.remove('hidden');
        dexTab.classList.add('active');
        cameraTab.classList.remove('active');
        updateDexUI();
    } else {
        natureDex.classList.add('hidden');
        cameraTab.classList.add('active');
        dexTab.classList.remove('active');
    }
}

// Event Listeners
snapBtn.addEventListener('click', captureSnapshot);
closeBtn.addEventListener('click', saveToCollection);
dexTab.addEventListener('click', () => toggleTab('dex'));
cameraTab.addEventListener('click', () => toggleTab('camera'));

// Start
initCamera();
updateDexUI();
