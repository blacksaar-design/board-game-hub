/**
 * Nature Snap - Core Logic
 */

const VERSION = "1.1.0-AI";

const state = {
    model: null,
    classifier: null,
    stream: null,
    isProcessing: false,
    collection: JSON.parse(localStorage.getItem('nature_collection') || '[]'),
    animalClasses: ['bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe'],
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
        countdownStatus.innerText = "LOADING AI MODELS...";
        // Load detection and classification models in parallel
        [state.model, state.classifier] = await Promise.all([
            cocoSsd.load(),
            mobilenet.load()
        ]);
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

        // Find animals first
        const animalDetections = predictions.filter(p =>
            state.animalClasses.includes(p.class) && p.score > 0.6
        );

        if (animalDetections.length > 0) {
            // Pick most prominent
            const primary = animalDetections.reduce((prev, curr) =>
                (prev.bbox[2] * prev.bbox[3] > curr.bbox[2] * curr.bbox[3]) ? prev : curr
            );

            // Classification stage: Use MobileNet on the original canvas
            const classifications = await state.classifier.classify(canvas);
            const speciesName = classifications[0].className;

            const result = processPredictions(animalDetections, primary, speciesName, canvas.width, canvas.height);
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
function processPredictions(allDetections, primary, speciesName, width, height) {
    const [x, y, w, h] = primary.bbox;

    // 1. Größe (Size)
    const areaPercent = (w * h) / (width * height);
    const sizeScore = Math.min(100, Math.floor(areaPercent * 250));

    // 2. Position
    const centerX = x + w / 2;
    const centerY = y + h / 2;
    const distFromCenter = Math.sqrt(
        Math.pow(centerX - width / 2, 2) +
        Math.pow(centerY - height / 2, 2)
    );
    const maxDist = Math.sqrt(Math.pow(width / 2, 2) + Math.pow(height / 2, 2));
    const posScore = Math.floor(100 * (1 - (distFromCenter / maxDist)));

    // 3. Weitere Tiere (Bonus)
    const bonusScore = Math.min(100, (allDetections.length - 1) * 50);

    // 4. Blickrichtung (Simulated)
    const gazeScore = Math.floor(50 + Math.random() * 50);

    const scores = {
        size: sizeScore,
        gaze: gazeScore,
        pos: posScore,
        bonus: bonusScore
    };

    const baseScore = 500;
    const qualityScore = (sizeScore * 10) + (gazeScore * 8) + (posScore * 12) + (bonusScore * 5);
    const totalScore = Math.floor(baseScore + qualityScore);

    // Filter species name - MobileNet names can be comma separated
    const cleanName = speciesName.split(',')[0].trim();

    return {
        name: cleanName,
        rarity: areaPercent < 0.1 || allDetections.length > 2 ? 'Super Rare' : 'Common',
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
