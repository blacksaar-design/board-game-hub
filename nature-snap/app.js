/**
 * Nature Snap - Core Logic
 */

const state = {
    model: null,
    stream: null,
    isProcessing: false,
    collection: JSON.parse(localStorage.getItem('nature_collection') || '[]'),
    animalClasses: ['bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe'],
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
        countdownStatus.innerText = "LOADING AI MODEL...";
        state.model = await cocoSsd.load();
        countdownStatus.innerText = "READY FOR SCAN";

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

    // Run AI Identification
    setTimeout(async () => {
        const predictions = await state.model.detect(canvas);
        const result = processPredictions(predictions, canvas.width, canvas.height);

        if (result) {
            showResult(result, imageData);
        } else {
            countdownStatus.innerText = "NO ANIMAL DETECTED";
            setTimeout(() => { countdownStatus.innerText = "READY FOR SCAN"; }, 2000);
        }

        state.isProcessing = false;
        snapBtn.style.opacity = "1";
    }, 100);
}

/**
 * Process AI Predictions
 */
function processPredictions(predictions, width, height) {
    // Filter for animals
    const animalDetections = predictions.filter(p => state.animalClasses.includes(p.class));

    if (animalDetections.length === 0) return null;

    // Pick the most "prominent" animal (largest box)
    const primary = animalDetections.reduce((prev, curr) =>
        (prev.bbox[2] * prev.bbox[3] > curr.bbox[2] * curr.bbox[3]) ? prev : curr
    );

    const [x, y, w, h] = primary.bbox;

    // 1. Größe (Size) - How much of the screen? (Target: 40% of image area = 100 points)
    const areaPercent = (w * h) / (width * height);
    const sizeScore = Math.min(100, Math.floor(areaPercent * 250));

    // 2. Position - How close to center?
    const centerX = x + w / 2;
    const centerY = y + h / 2;
    const distFromCenter = Math.sqrt(
        Math.pow(centerX - width / 2, 2) +
        Math.pow(centerY - height / 2, 2)
    );
    const maxDist = Math.sqrt(Math.pow(width / 2, 2) + Math.pow(height / 2, 2));
    const posScore = Math.floor(100 * (1 - (distFromCenter / maxDist)));

    // 3. Weitere Tiere (Bonus)
    const bonusScore = Math.min(100, (animalDetections.length - 1) * 50);

    // 4. Blickrichtung (Simulated logic based on aspect ratio as proxy for pose)
    // In real AI this would need a pose model, here we use a small random jitter on a base score
    const gazeScore = Math.floor(50 + Math.random() * 50);

    const scores = {
        size: sizeScore,
        gaze: gazeScore,
        pos: posScore,
        bonus: bonusScore
    };

    const baseScore = 500; // Base discovery score
    const qualityScore = (sizeScore * 10) + (gazeScore * 8) + (posScore * 12) + (bonusScore * 5);
    const totalScore = Math.floor(baseScore + qualityScore);

    return {
        name: primary.class.charAt(0).toUpperCase() + primary.class.slice(1),
        rarity: areaPercent < 0.1 ? 'Rare Finding' : 'Common',
        categories: scores,
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

    // Update Score Bars with animation delay
    setTimeout(() => {
        document.getElementById('score-size').style.width = `${result.categories.size}%`;
        document.getElementById('score-gaze').style.width = `${result.categories.gaze}%`;
        document.getElementById('score-pos').style.width = `${result.categories.pos}%`;
        document.getElementById('score-bonus').style.width = `${result.categories.bonus}%`;
    }, 100);

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
