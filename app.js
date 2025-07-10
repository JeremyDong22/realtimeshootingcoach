// DOM Elements
const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('canvas');
const canvasCtx = canvasElement.getContext('2d');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const recordBtn = document.getElementById('recordBtn');
const resetBtn = document.getElementById('resetBtn');

// Mode buttons
const poseModeBtn = document.getElementById('poseMode');
const handModeBtn = document.getElementById('handMode');
const combinedModeBtn = document.getElementById('combinedMode');

// Info elements
const fpsElement = document.getElementById('fps');
const leftWristPosElement = document.getElementById('leftWristPos');
const rightWristPosElement = document.getElementById('rightWristPos');
const leftWristVelElement = document.getElementById('leftWristVel');
const rightWristVelElement = document.getElementById('rightWristVel');
const angularVelElement = document.getElementById('angularVel');
const leftIndexPosElement = document.getElementById('leftIndexPos');
const rightIndexPosElement = document.getElementById('rightIndexPos');
const leftFingerVelElement = document.getElementById('leftFingerVel');
const rightFingerVelElement = document.getElementById('rightFingerVel');
const wristFingerDistElement = document.getElementById('wristFingerDist');
const overallMovementElement = document.getElementById('overallMovement');
const depthMovementElement = document.getElementById('depthMovement');
const maxVelocityElement = document.getElementById('maxVelocity');
const movementPatternElement = document.getElementById('movementPattern');

// Global variables
let camera = null;
let lastTime = Date.now();
let fps = 0;
let currentMode = 'pose'; // 'pose', 'hands', 'combined'
let isRecording = false;
let recordedData = [];

// Initialize MediaPipe solutions
let pose, hands, holistic;

// Movement history storage
const movementHistory = {
    leftWrist: [],
    rightWrist: [],
    leftIndex: [],
    rightIndex: [],
    leftMiddle: [],
    rightMiddle: []
};
const MAX_HISTORY = 30;

// Velocity tracking
let maxVelocityRecorded = 0;
let velocityData = [];
let velocityChart = null;

// 3D movement calculations
const depthHistory = [];
let overallMovement = 0;

// Initialize MediaPipe Pose
function initializePose() {
    pose = new Pose({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
        }
    });

    pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        smoothSegmentation: false,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5
    });

    pose.onResults(onPoseResults);
}

// Initialize MediaPipe Hands
function initializeHands() {
    hands = new Hands({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
    });

    hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5
    });

    hands.onResults(onHandsResults);
}

// Initialize MediaPipe Holistic (Combined)
function initializeHolistic() {
    holistic = new Holistic({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`;
        }
    });

    holistic.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        smoothSegmentation: false,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5,
        minHandDetectionConfidence: 0.7,
        minHandTrackingConfidence: 0.5
    });

    holistic.onResults(onHolisticResults);
}

// Pose results handler
function onPoseResults(results) {
    updateFPS();
    clearCanvas();
    drawVideo(results.image);

    if (results.poseLandmarks) {
        // Draw pose
        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, {
            color: '#00FF00',
            lineWidth: 3
        });
        
        drawLandmarks(canvasCtx, results.poseLandmarks, {
            color: '#FF0000',
            lineWidth: 2,
            radius: 4
        });

        // Analyze pose movement
        analyzePoseMovement(results.poseLandmarks);
    }
}

// Hands results handler
function onHandsResults(results) {
    updateFPS();
    clearCanvas();
    drawVideo(results.image);

    if (results.multiHandLandmarks) {
        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            const landmarks = results.multiHandLandmarks[i];
            const handedness = results.multiHandedness[i].label;
            
            // Draw hand
            drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {
                color: handedness === 'Left' ? '#FF00FF' : '#00FFFF',
                lineWidth: 2
            });
            
            drawLandmarks(canvasCtx, landmarks, {
                color: handedness === 'Left' ? '#FF00FF' : '#00FFFF',
                lineWidth: 1,
                radius: 3
            });

            // Analyze hand movement
            analyzeHandMovement(landmarks, handedness);
        }
    }
}

// Holistic results handler
function onHolisticResults(results) {
    updateFPS();
    clearCanvas();
    drawVideo(results.image);

    // Draw pose if available
    if (results.poseLandmarks) {
        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, {
            color: '#00FF00',
            lineWidth: 2
        });
        
        drawLandmarks(canvasCtx, results.poseLandmarks, {
            color: '#FF0000',
            lineWidth: 1,
            radius: 3
        });

        analyzePoseMovement(results.poseLandmarks);
    }

    // Draw hands if available
    if (results.leftHandLandmarks) {
        drawConnectors(canvasCtx, results.leftHandLandmarks, HAND_CONNECTIONS, {
            color: '#FF00FF',
            lineWidth: 2
        });
        
        drawLandmarks(canvasCtx, results.leftHandLandmarks, {
            color: '#FF00FF',
            lineWidth: 1,
            radius: 3
        });

        analyzeHandMovement(results.leftHandLandmarks, 'Left');
    }

    if (results.rightHandLandmarks) {
        drawConnectors(canvasCtx, results.rightHandLandmarks, HAND_CONNECTIONS, {
            color: '#00FFFF',
            lineWidth: 2
        });
        
        drawLandmarks(canvasCtx, results.rightHandLandmarks, {
            color: '#00FFFF',
            lineWidth: 1,
            radius: 3
        });

        analyzeHandMovement(results.rightHandLandmarks, 'Right');
    }
}

// Movement analysis functions
function analyzePoseMovement(landmarks) {
    const currentTime = Date.now();
    
    // Get wrist landmarks (15 = left, 16 = right)
    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];

    if (leftWrist && rightWrist) {
        // Update position displays
        leftWristPosElement.textContent = `X:${leftWrist.x.toFixed(3)} Y:${leftWrist.y.toFixed(3)} Z:${leftWrist.z.toFixed(3)}`;
        rightWristPosElement.textContent = `X:${rightWrist.x.toFixed(3)} Y:${rightWrist.y.toFixed(3)} Z:${rightWrist.z.toFixed(3)}`;

        // Store movement history
        storeMovementData('leftWrist', leftWrist, currentTime);
        storeMovementData('rightWrist', rightWrist, currentTime);

        // Calculate velocities
        const leftVel = calculateVelocity('leftWrist');
        const rightVel = calculateVelocity('rightWrist');

        leftWristVelElement.textContent = `${leftVel.toFixed(1)} units/s`;
        rightWristVelElement.textContent = `${rightVel.toFixed(1)} units/s`;

        // Calculate angular velocity
        const angularVel = calculateAngularVelocity(leftWrist, rightWrist);
        angularVelElement.textContent = `${angularVel.toFixed(1)}°/s`;

        // Update max velocity
        const maxVel = Math.max(leftVel, rightVel);
        if (maxVel > maxVelocityRecorded) {
            maxVelocityRecorded = maxVel;
            maxVelocityElement.textContent = `${maxVelocityRecorded.toFixed(1)} units/s`;
        }

        // Calculate overall movement
        calculateOverallMovement();

        // Detect movement patterns
        detectMovementPattern();

        // Draw trails
        drawMovementTrail('leftWrist', '#FF00FF');
        drawMovementTrail('rightWrist', '#00FFFF');

        // Record data if recording
        if (isRecording) {
            recordMovementData(currentTime, landmarks);
        }
    }
}

function analyzeHandMovement(landmarks, handedness) {
    const currentTime = Date.now();
    
    // Get finger landmarks (8 = index tip, 12 = middle tip)
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const wrist = landmarks[0];

    if (indexTip && wrist) {
        const side = handedness.toLowerCase();
        
        // Update finger position displays
        if (side === 'left') {
            leftIndexPosElement.textContent = `X:${indexTip.x.toFixed(3)} Y:${indexTip.y.toFixed(3)} Z:${indexTip.z.toFixed(3)}`;
        } else {
            rightIndexPosElement.textContent = `X:${indexTip.x.toFixed(3)} Y:${indexTip.y.toFixed(3)} Z:${indexTip.z.toFixed(3)}`;
        }

        // Store finger movement
        storeMovementData(`${side}Index`, indexTip, currentTime);

        // Calculate finger velocity
        const fingerVel = calculateVelocity(`${side}Index`);
        if (side === 'left') {
            leftFingerVelElement.textContent = `${fingerVel.toFixed(1)} units/s`;
        } else {
            rightFingerVelElement.textContent = `${fingerVel.toFixed(1)} units/s`;
        }

        // Calculate wrist-finger distance
        const distance = calculate3DDistance(wrist, indexTip);
        wristFingerDistElement.textContent = `${distance.toFixed(3)} units`;

        // Draw finger trails
        drawMovementTrail(`${side}Index`, side === 'left' ? '#FF88FF' : '#88FFFF');
    }
}

// Utility functions
function updateFPS() {
    const currentTime = Date.now();
    const deltaTime = currentTime - lastTime;
    fps = Math.round(1000 / deltaTime);
    lastTime = currentTime;
    fpsElement.textContent = fps;
}

function clearCanvas() {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
}

function drawVideo(image) {
    canvasCtx.drawImage(image, 0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.restore();
}

function storeMovementData(key, landmark, time) {
    if (!movementHistory[key]) {
        movementHistory[key] = [];
    }

    movementHistory[key].push({
        x: landmark.x,
        y: landmark.y,
        z: landmark.z,
        time: time
    });

    // Keep history limited
    if (movementHistory[key].length > MAX_HISTORY) {
        movementHistory[key].shift();
    }
}

function calculateVelocity(key) {
    const history = movementHistory[key];
    if (history.length < 2) return 0;

    const recent = history[history.length - 1];
    const previous = history[history.length - 2];
    
    const distance = calculate3DDistance(previous, recent);
    const timeDiff = (recent.time - previous.time) / 1000; // Convert to seconds
    
    return timeDiff > 0 ? distance / timeDiff : 0;
}

function calculate3DDistance(point1, point2) {
    return Math.sqrt(
        Math.pow(point2.x - point1.x, 2) + 
        Math.pow(point2.y - point1.y, 2) + 
        Math.pow(point2.z - point1.z, 2)
    );
}

function calculateAngularVelocity(leftWrist, rightWrist) {
    // Calculate angle between wrists and horizontal
    const dx = rightWrist.x - leftWrist.x;
    const dy = rightWrist.y - leftWrist.y;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    
    // Store angle history
    if (!window.angleHistory) window.angleHistory = [];
    window.angleHistory.push({ angle, time: Date.now() });
    
    if (window.angleHistory.length > 10) {
        window.angleHistory.shift();
    }
    
    if (window.angleHistory.length >= 2) {
        const recent = window.angleHistory[window.angleHistory.length - 1];
        const previous = window.angleHistory[window.angleHistory.length - 2];
        
        const angleDiff = recent.angle - previous.angle;
        const timeDiff = (recent.time - previous.time) / 1000;
        
        return timeDiff > 0 ? Math.abs(angleDiff / timeDiff) : 0;
    }
    
    return 0;
}

function calculateOverallMovement() {
    let totalMovement = 0;
    let count = 0;

    Object.keys(movementHistory).forEach(key => {
        const history = movementHistory[key];
        if (history.length >= 2) {
            const recent = history[history.length - 1];
            const previous = history[history.length - 2];
            totalMovement += calculate3DDistance(previous, recent);
            count++;
        }
    });

    if (count > 0) {
        overallMovement = totalMovement / count;
        overallMovementElement.textContent = `${overallMovement.toFixed(4)} units`;
    }

    // Calculate depth movement
    calculateDepthMovement();
}

function calculateDepthMovement() {
    const leftWristHistory = movementHistory.leftWrist;
    const rightWristHistory = movementHistory.rightWrist;
    
    if (leftWristHistory.length >= 2 && rightWristHistory.length >= 2) {
        const leftRecent = leftWristHistory[leftWristHistory.length - 1];
        const leftPrevious = leftWristHistory[leftWristHistory.length - 2];
        const rightRecent = rightWristHistory[rightWristHistory.length - 1];
        const rightPrevious = rightWristHistory[rightWristHistory.length - 2];
        
        const leftZDiff = Math.abs(leftRecent.z - leftPrevious.z);
        const rightZDiff = Math.abs(rightRecent.z - rightPrevious.z);
        const avgZMovement = (leftZDiff + rightZDiff) / 2;
        
        depthMovementElement.textContent = `${avgZMovement.toFixed(4)} units`;
    }
}

function detectMovementPattern() {
    // Simple pattern detection based on movement characteristics
    let pattern = "Steady";
    
    if (overallMovement > 0.01) {
        pattern = "High Activity";
    } else if (overallMovement > 0.005) {
        pattern = "Moderate Activity";
    } else if (overallMovement > 0.001) {
        pattern = "Low Activity";
    } else {
        pattern = "Minimal Movement";
    }
    
    movementPatternElement.textContent = pattern;
}

function drawMovementTrail(key, color) {
    const history = movementHistory[key];
    if (history.length < 2) return;

    canvasCtx.save();
    canvasCtx.strokeStyle = color;
    canvasCtx.lineWidth = 3;
    canvasCtx.lineCap = 'round';

    for (let i = 1; i < history.length; i++) {
        const alpha = i / history.length;
        canvasCtx.globalAlpha = alpha * 0.7;
        
        const prev = history[i - 1];
        const curr = history[i];
        
        canvasCtx.beginPath();
        canvasCtx.moveTo(prev.x * canvasElement.width, prev.y * canvasElement.height);
        canvasCtx.lineTo(curr.x * canvasElement.width, curr.y * canvasElement.height);
        canvasCtx.stroke();
    }

    canvasCtx.restore();
}

function recordMovementData(time, landmarks) {
    recordedData.push({
        timestamp: time,
        landmarks: JSON.parse(JSON.stringify(landmarks)),
        velocities: {
            leftWrist: calculateVelocity('leftWrist'),
            rightWrist: calculateVelocity('rightWrist'),
            leftIndex: calculateVelocity('leftIndex'),
            rightIndex: calculateVelocity('rightIndex')
        }
    });
}

// Mode switching
function switchMode(mode) {
    currentMode = mode;
    
    // Update button states
    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
    
    if (mode === 'pose') {
        poseModeBtn.classList.add('active');
    } else if (mode === 'hands') {
        handModeBtn.classList.add('active');
    } else if (mode === 'combined') {
        combinedModeBtn.classList.add('active');
    }
    
    // Clear movement history when switching modes
    Object.keys(movementHistory).forEach(key => {
        movementHistory[key] = [];
    });
}

// Event listeners
poseModeBtn.addEventListener('click', () => switchMode('pose'));
handModeBtn.addEventListener('click', () => switchMode('hands'));
combinedModeBtn.addEventListener('click', () => switchMode('combined'));

startBtn.addEventListener('click', async () => {
    try {
        startBtn.classList.add('loading');
        startBtn.textContent = 'Initializing...';
        
        // Initialize MediaPipe based on mode
        if (currentMode === 'pose') {
            initializePose();
        } else if (currentMode === 'hands') {
            initializeHands();
        } else {
            initializeHolistic();
        }

        // Camera setup
        const constraints = {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            }
        };

        camera = new Camera(videoElement, {
            onFrame: async () => {
                if (currentMode === 'pose' && pose) {
                    await pose.send({ image: videoElement });
                } else if (currentMode === 'hands' && hands) {
                    await hands.send({ image: videoElement });
                } else if (currentMode === 'combined' && holistic) {
                    await holistic.send({ image: videoElement });
                }
            },
            width: 1280,
            height: 720
        });

        await camera.start();

        // Set canvas dimensions
        canvasElement.width = videoElement.videoWidth || 1280;
        canvasElement.height = videoElement.videoHeight || 720;

        startBtn.style.display = 'none';
        stopBtn.style.display = 'block';
        recordBtn.style.display = 'block';
        
        startBtn.classList.remove('loading');
        startBtn.textContent = 'Start Camera';
        
    } catch (error) {
        console.error('Error starting camera:', error);
        alert('Error accessing camera. Please ensure you have granted camera permissions.');
        startBtn.classList.remove('loading');
        startBtn.textContent = 'Start Camera';
    }
});

stopBtn.addEventListener('click', () => {
    if (camera) {
        camera.stop();
        camera = null;
    }
    
    startBtn.style.display = 'block';
    stopBtn.style.display = 'none';
    recordBtn.style.display = 'none';
    
    // Clear canvas
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Clear movement history
    Object.keys(movementHistory).forEach(key => {
        movementHistory[key] = [];
    });
    
    // Stop recording if active
    if (isRecording) {
        toggleRecording();
    }
});

recordBtn.addEventListener('click', toggleRecording);

function toggleRecording() {
    isRecording = !isRecording;
    
    if (isRecording) {
        recordBtn.textContent = 'Stop Recording';
        recordBtn.classList.add('recording');
        recordedData = [];
    } else {
        recordBtn.textContent = 'Record Data';
        recordBtn.classList.remove('recording');
        
        // Save recorded data
        if (recordedData.length > 0) {
            downloadRecordedData();
        }
    }
}

function downloadRecordedData() {
    const dataStr = JSON.stringify(recordedData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `movement_data_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
}

resetBtn.addEventListener('click', () => {
    // Reset all data
    Object.keys(movementHistory).forEach(key => {
        movementHistory[key] = [];
    });
    
    maxVelocityRecorded = 0;
    overallMovement = 0;
    recordedData = [];
    
    // Reset displays
    document.querySelectorAll('.value').forEach(el => {
        el.textContent = '-';
    });
    
    // Clear canvas
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
});

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    console.log('MediaPipe 3D Movement Analysis initialized');
    console.log('Mode:', currentMode);
    
    // Set initial canvas size
    canvasElement.width = 1280;
    canvasElement.height = 720;
});

// Handle orientation changes for mobile
window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        if (camera && videoElement.videoWidth) {
            canvasElement.width = videoElement.videoWidth;
            canvasElement.height = videoElement.videoHeight;
        }
    }, 500);
});

// Performance monitoring
setInterval(() => {
    if (camera && movementHistory.leftWrist.length > 0) {
        const memoryUsage = performance.memory ? 
            (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(1) + ' MB' : 
            'N/A';
        console.log(`FPS: ${fps}, Memory: ${memoryUsage}`);
    }
}, 5000);