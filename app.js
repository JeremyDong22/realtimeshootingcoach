const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('canvas');
const canvasCtx = canvasElement.getContext('2d');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');

// Info elements
const fpsElement = document.getElementById('fps');
const leftWristElement = document.getElementById('leftWrist');
const rightWristElement = document.getElementById('rightWrist');
const wristSpeedElement = document.getElementById('wristSpeed');

// Debug elements
const poseDetectedElement = document.getElementById('poseDetected');
const handActiveElement = document.getElementById('handActive');
const handLandmarksElement = document.getElementById('handLandmarks');
const wristAboveShoulderElement = document.getElementById('wristAboveShoulder');
const currentAngleElement = document.getElementById('currentAngle');
const angleVelocityElement = document.getElementById('angleVelocity');
const detectionStateElement = document.getElementById('detectionState');

let camera = null;
let lastTime = Date.now();
let fps = 0;

// Store previous wrist positions for speed calculation and trails
const wristHistory = {
    left: [],
    right: []
};
const MAX_HISTORY = 20;

// Store angle history for angular velocity calculation
const angleHistory = {
    left: [],
    right: []
};

// Hand angle history (more precise)
const handAngleHistory = {
    left: [],
    right: []
};

// Shot detection state
let shotDetected = false;
let shotCooldown = 0;

// Initialize MediaPipe Holistic
const holistic = new Holistic({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`;
    }
});

holistic.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    smoothSegmentation: false,
    refineFaceLandmarks: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

holistic.onResults(onResults);

function updateDebugInfo(state) {
    // Update debug panel
    poseDetectedElement.textContent = state.poseDetected ? 'Yes' : 'No';
    poseDetectedElement.className = state.poseDetected ? 'active' : '';
    
    handActiveElement.textContent = state.handActive ? 'Yes' : 'No';
    handActiveElement.className = state.handActive ? 'active' : '';
    
    handLandmarksElement.textContent = state.handLandmarks || '0';
    
    wristAboveShoulderElement.textContent = state.wristAboveShoulder ? 'Yes' : 'No';
    wristAboveShoulderElement.className = state.wristAboveShoulder ? 'active' : '';
    
    currentAngleElement.textContent = state.currentAngle ? `${state.currentAngle.toFixed(1)}°` : '-';
    angleVelocityElement.textContent = state.angleVelocity ? `${state.angleVelocity.toFixed(0)}°/s` : '-';
    detectionStateElement.textContent = state.detectionState || 'Idle';
}

function onResults(results) {
    // Calculate FPS
    const currentTime = Date.now();
    const deltaTime = currentTime - lastTime;
    fps = Math.round(1000 / deltaTime);
    lastTime = currentTime;
    fpsElement.textContent = fps;

    // Debug state
    const debugState = {
        poseDetected: false,
        handActive: false,
        handLandmarks: 0,
        wristAboveShoulder: false,
        currentAngle: null,
        angleVelocity: null,
        detectionState: 'Idle'
    };

    // Clear canvas
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Draw the video
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.poseLandmarks) {
        debugState.poseDetected = true;
        
        // Draw pose skeleton
        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, {
            color: '#00FF00',
            lineWidth: 2
        });
        
        // Draw pose landmarks
        drawLandmarks(canvasCtx, results.poseLandmarks, {
            color: '#FF0000',
            lineWidth: 1,
            radius: 3
        });

        // Get pose landmarks for shot detection
        const leftWrist = results.poseLandmarks[15];
        const rightWrist = results.poseLandmarks[16];
        const leftShoulder = results.poseLandmarks[11];
        const rightShoulder = results.poseLandmarks[12];

        // Update wrist position display
        leftWristElement.textContent = `x: ${leftWrist.x.toFixed(3)}, y: ${leftWrist.y.toFixed(3)}, z: ${leftWrist.z.toFixed(3)}`;
        rightWristElement.textContent = `x: ${rightWrist.x.toFixed(3)}, y: ${rightWrist.y.toFixed(3)}, z: ${rightWrist.z.toFixed(3)}`;

        // Convert normalized coordinates to canvas coordinates
        const leftWristCanvas = {
            x: leftWrist.x * canvasElement.width,
            y: leftWrist.y * canvasElement.height
        };
        const rightWristCanvas = {
            x: rightWrist.x * canvasElement.width,
            y: rightWrist.y * canvasElement.height
        };

        // Add to history
        wristHistory.left.push({...leftWristCanvas, time: currentTime});
        wristHistory.right.push({...rightWristCanvas, time: currentTime});

        // Keep history limited
        if (wristHistory.left.length > MAX_HISTORY) wristHistory.left.shift();
        if (wristHistory.right.length > MAX_HISTORY) wristHistory.right.shift();

        // Draw wrist trails
        drawWristTrail(wristHistory.left, '#FF00FF');
        drawWristTrail(wristHistory.right, '#00FFFF');

        // Highlight wrists with larger circles
        drawWrist(leftWristCanvas, '#FF00FF', 'L');
        drawWrist(rightWristCanvas, '#00FFFF', 'R');

        // Check if wrists are above shoulders
        const leftWristAbove = leftWrist.y < leftShoulder.y;
        const rightWristAbove = rightWrist.y < rightShoulder.y;
        debugState.wristAboveShoulder = leftWristAbove || rightWristAbove;

        // Process hand landmarks if available
        if (results.leftHandLandmarks && leftWristAbove) {
            debugState.handActive = true;
            debugState.handLandmarks = results.leftHandLandmarks.length;
            
            // Draw hand skeleton
            drawConnectors(canvasCtx, results.leftHandLandmarks, HAND_CONNECTIONS, {
                color: '#FF00FF',
                lineWidth: 3
            });
            
            // Draw hand landmarks
            drawLandmarks(canvasCtx, results.leftHandLandmarks, {
                color: '#FF00FF',
                lineWidth: 2,
                radius: 4
            });

            // Calculate precise angle using hand landmarks
            processHandForShot(results.leftHandLandmarks, 'left', currentTime, debugState);
        }

        if (results.rightHandLandmarks && rightWristAbove) {
            debugState.handActive = true;
            debugState.handLandmarks = results.rightHandLandmarks.length;
            
            // Draw hand skeleton
            drawConnectors(canvasCtx, results.rightHandLandmarks, HAND_CONNECTIONS, {
                color: '#00FFFF',
                lineWidth: 3
            });
            
            // Draw hand landmarks
            drawLandmarks(canvasCtx, results.rightHandLandmarks, {
                color: '#00FFFF',
                lineWidth: 2,
                radius: 4
            });

            // Calculate precise angle using hand landmarks
            processHandForShot(results.rightHandLandmarks, 'right', currentTime, debugState);
        }

        // If no hand detected but wrist is up, use pose landmarks
        if (!results.leftHandLandmarks && leftWristAbove) {
            const leftIndex = results.poseLandmarks[19];
            processPoseForShot(leftWrist, leftIndex, 'left', currentTime, debugState);
        }
        
        if (!results.rightHandLandmarks && rightWristAbove) {
            const rightIndex = results.poseLandmarks[20];
            processPoseForShot(rightWrist, rightIndex, 'right', currentTime, debugState);
        }
    }

    // Update debug info
    updateDebugInfo(debugState);

    // Decrease cooldown
    if (shotCooldown > 0) {
        shotCooldown--;
        debugState.detectionState = `Cooldown: ${shotCooldown}`;
        updateDebugInfo(debugState);
    }

    canvasCtx.restore();
}

function processHandForShot(handLandmarks, side, currentTime, debugState) {
    // Use wrist (0) and middle finger MCP (9) for more stable angle
    const wrist = handLandmarks[0];
    const middleMcp = handLandmarks[9];
    
    // Calculate angle
    const dx = middleMcp.x - wrist.x;
    const dy = middleMcp.y - wrist.y;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    
    debugState.currentAngle = angle;
    
    // Add to hand angle history
    handAngleHistory[side].push({ angle, time: currentTime });
    
    // Keep history limited
    if (handAngleHistory[side].length > 10) {
        handAngleHistory[side].shift();
    }
    
    // Calculate angular velocity if we have enough history
    if (handAngleHistory[side].length >= 3) {
        const recent = handAngleHistory[side][handAngleHistory[side].length - 1];
        const previous = handAngleHistory[side][handAngleHistory[side].length - 3];
        
        const angleDiff = recent.angle - previous.angle;
        const timeDiff = (recent.time - previous.time) / 1000; // seconds
        const angularVelocity = Math.abs(angleDiff / timeDiff);
        
        debugState.angleVelocity = angularVelocity;
        
        // Update display with angular velocity
        wristSpeedElement.textContent = `${angularVelocity.toFixed(0)}°/s`;
        
        // Check for shooting motion - lowered threshold to 150°/s (half of 300)
        if (angularVelocity > 150 && angleDiff > 0 && shotCooldown === 0) {
            debugState.detectionState = 'Shot Detected!';
            
            // Additional check: ensure the motion is forward
            if (previous.angle < 0 && recent.angle > previous.angle) {
                console.log(`SHOT DETECTED! Hand tracking - Side: ${side}, Velocity: ${angularVelocity.toFixed(0)}°/s`);
                triggerShotDetection();
            }
        }
    }
}

function processPoseForShot(wrist, index, side, currentTime, debugState) {
    // Calculate angle between wrist-index vector
    const dx = index.x - wrist.x;
    const dy = index.y - wrist.y;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    
    debugState.currentAngle = angle;
    
    // Add to angle history
    angleHistory[side].push({ angle, time: currentTime });
    
    // Keep history limited
    if (angleHistory[side].length > 10) {
        angleHistory[side].shift();
    }
    
    // Calculate angular velocity if we have enough history
    if (angleHistory[side].length >= 3) {
        const recent = angleHistory[side][angleHistory[side].length - 1];
        const previous = angleHistory[side][angleHistory[side].length - 3];
        
        const angleDiff = recent.angle - previous.angle;
        const timeDiff = (recent.time - previous.time) / 1000; // seconds
        const angularVelocity = Math.abs(angleDiff / timeDiff);
        
        debugState.angleVelocity = angularVelocity;
        
        // Update display with angular velocity
        wristSpeedElement.textContent = `${angularVelocity.toFixed(0)}°/s`;
        
        // Check for shooting motion - lowered threshold to 150°/s
        if (angularVelocity > 150 && angleDiff > 0 && shotCooldown === 0) {
            debugState.detectionState = 'Shot Detected!';
            
            // Additional check: ensure the motion is forward
            if (previous.angle < 0 && recent.angle > previous.angle) {
                console.log(`SHOT DETECTED! Pose tracking - Side: ${side}, Velocity: ${angularVelocity.toFixed(0)}°/s`);
                triggerShotDetection();
            }
        }
    }
}

function drawWristTrail(history, color) {
    if (history.length < 2) return;

    canvasCtx.save();
    canvasCtx.strokeStyle = color;
    canvasCtx.lineWidth = 3;
    canvasCtx.lineCap = 'round';

    for (let i = 1; i < history.length; i++) {
        const alpha = i / history.length;
        canvasCtx.globalAlpha = alpha * 0.5;
        canvasCtx.beginPath();
        canvasCtx.moveTo(history[i - 1].x, history[i - 1].y);
        canvasCtx.lineTo(history[i].x, history[i].y);
        canvasCtx.stroke();
    }

    canvasCtx.restore();
}

function drawWrist(position, color, label) {
    // Outer circle
    canvasCtx.save();
    canvasCtx.fillStyle = color;
    canvasCtx.globalAlpha = 0.3;
    canvasCtx.beginPath();
    canvasCtx.arc(position.x, position.y, 20, 0, 2 * Math.PI);
    canvasCtx.fill();

    // Inner circle
    canvasCtx.globalAlpha = 1;
    canvasCtx.beginPath();
    canvasCtx.arc(position.x, position.y, 8, 0, 2 * Math.PI);
    canvasCtx.fill();

    // Label
    canvasCtx.fillStyle = 'white';
    canvasCtx.font = 'bold 16px Arial';
    canvasCtx.textAlign = 'center';
    canvasCtx.textBaseline = 'middle';
    canvasCtx.fillText(label, position.x, position.y);

    canvasCtx.restore();
}

function triggerShotDetection() {
    if (!shotDetected) {
        shotDetected = true;
        shotCooldown = 30; // Prevent multiple detections for 30 frames
        
        // Visual feedback
        const canvas = document.getElementById('canvas');
        canvas.style.border = '5px solid #00FF00';
        
        // Text alert
        const alertDiv = document.createElement('div');
        alertDiv.textContent = 'Basketball Shot Detected!';
        alertDiv.style.position = 'absolute';
        alertDiv.style.top = '50%';
        alertDiv.style.left = '50%';
        alertDiv.style.transform = 'translate(-50%, -50%)';
        alertDiv.style.fontSize = '32px';
        alertDiv.style.color = '#00FF00';
        alertDiv.style.fontWeight = 'bold';
        alertDiv.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
        alertDiv.style.pointerEvents = 'none';
        alertDiv.style.zIndex = '100';
        
        document.querySelector('.container').appendChild(alertDiv);
        
        // Remove visual feedback after 1 second
        setTimeout(() => {
            canvas.style.border = 'none';
            alertDiv.remove();
            shotDetected = false;
        }, 1000);
    }
}

// Camera setup
startBtn.addEventListener('click', async () => {
    startBtn.style.display = 'none';
    stopBtn.style.display = 'block';

    // Set canvas size to match video
    const constraints = {
        video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
        }
    };

    camera = new Camera(videoElement, {
        onFrame: async () => {
            await holistic.send({ image: videoElement });
        },
        width: 1280,
        height: 720
    });

    await camera.start();

    // Set canvas dimensions
    canvasElement.width = videoElement.videoWidth || 1280;
    canvasElement.height = videoElement.videoHeight || 720;
    
    console.log('MediaPipe Holistic initialized - tracking pose + hands');
});

stopBtn.addEventListener('click', () => {
    if (camera) {
        camera.stop();
        camera = null;
    }
    startBtn.style.display = 'block';
    stopBtn.style.display = 'none';
    
    // Clear canvas
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Clear history
    wristHistory.left = [];
    wristHistory.right = [];
    angleHistory.left = [];
    angleHistory.right = [];
    handAngleHistory.left = [];
    handAngleHistory.right = [];
    
    // Reset debug info
    updateDebugInfo({
        poseDetected: false,
        handActive: false,
        handLandmarks: 0,
        wristAboveShoulder: false,
        currentAngle: null,
        angleVelocity: null,
        detectionState: 'Stopped'
    });
});