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
const past90DegreesElement = document.getElementById('past90Degrees');
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

// Shot detection state
let shotDetected = false;
let shotCooldown = 0;

// Configuration - focusing on right hand only
const SHOOTING_HAND = 'right';
const VELOCITY_THRESHOLD = 300; // degrees per second

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
    refineFaceLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

holistic.onResults(onResults);


function updateDebugInfo(state) {
    // Update debug panel
    poseDetectedElement.textContent = state.poseDetected ? 'Yes' : 'No';
    poseDetectedElement.className = state.poseDetected ? 'active' : '';
    
    past90DegreesElement.textContent = state.past90Degrees ? 'Yes' : 'No';
    past90DegreesElement.className = state.past90Degrees ? 'active' : '';
    
    wristAboveShoulderElement.textContent = state.wristAboveShoulder ? 'Yes' : 'No';
    wristAboveShoulderElement.className = state.wristAboveShoulder ? 'active' : '';
    
    currentAngleElement.textContent = state.currentAngle !== null ? `${state.currentAngle.toFixed(1)}°` : '-';
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
        past90Degrees: false,
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
        

        // Get pose landmarks
        // Right side: wrist=16, index=20, shoulder=12, elbow=14
        // Left side: wrist=15, index=19, shoulder=11, elbow=13
        
        const rightWrist = results.poseLandmarks[16];
        const rightIndex = results.poseLandmarks[20];
        const rightShoulder = results.poseLandmarks[12];
        const rightElbow = results.poseLandmarks[14];
        
        const leftWrist = results.poseLandmarks[15];
        const leftShoulder = results.poseLandmarks[11];
        

        // Update wrist position display
        leftWristElement.textContent = `x: ${leftWrist.x.toFixed(3)}, y: ${leftWrist.y.toFixed(3)}, z: ${leftWrist.z.toFixed(3)}`;
        rightWristElement.textContent = `x: ${rightWrist.x.toFixed(3)}, y: ${rightWrist.y.toFixed(3)}, z: ${rightWrist.z.toFixed(3)}`;

        // Convert normalized coordinates to canvas coordinates
        const rightWristCanvas = {
            x: rightWrist.x * canvasElement.width,
            y: rightWrist.y * canvasElement.height
        };
        
        const rightIndexCanvas = {
            x: rightIndex.x * canvasElement.width,
            y: rightIndex.y * canvasElement.height
        };

        const leftWristCanvas = {
            x: leftWrist.x * canvasElement.width,
            y: leftWrist.y * canvasElement.height
        };

        // Add to history
        wristHistory.right.push({...rightWristCanvas, time: currentTime});
        wristHistory.left.push({...leftWristCanvas, time: currentTime});

        // Keep history limited
        if (wristHistory.right.length > MAX_HISTORY) wristHistory.right.shift();
        if (wristHistory.left.length > MAX_HISTORY) wristHistory.left.shift();

        // Draw wrist trails
        drawWristTrail(wristHistory.left, '#FF00FF');
        drawWristTrail(wristHistory.right, '#00FFFF');

        // Highlight wrists and index finger
        drawWrist(leftWristCanvas, '#FF00FF', 'L');
        drawWrist(rightWristCanvas, '#00FFFF', 'R');
        drawWrist(rightIndexCanvas, '#FFD700', 'I'); // Draw index in gold

        // Check if right wrist is above shoulder
        const wristAboveShoulder = rightWrist.y < rightShoulder.y;
        debugState.wristAboveShoulder = wristAboveShoulder;


        if (wristAboveShoulder) {
            // Calculate angle between wrist-index vector
            const dx = rightIndex.x - rightWrist.x;
            const dy = rightIndex.y - rightWrist.y;
            
            // Calculate angle from horizontal
            // For right hand: -90° = up, 0° = right, 90° = down, ±180° = left
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            
            debugState.currentAngle = angle;
            // For right hand, past vertical means angle < 90 (forward release position)
            debugState.past90Degrees = angle < 90;
            
            // Add to angle history
            angleHistory.right.push({ 
                angle: angle, 
                time: currentTime,
                dx: dx,
                dy: dy
            });
            
            // Keep history limited
            if (angleHistory.right.length > 10) {
                angleHistory.right.shift();
            }
            
            // Calculate angular velocity if we have enough history
            if (angleHistory.right.length >= 3) {
                const recent = angleHistory.right[angleHistory.right.length - 1];
                const previous = angleHistory.right[angleHistory.right.length - 3];
                
                const angleDiff = recent.angle - previous.angle;
                const timeDiff = (recent.time - previous.time) / 1000; // seconds
                const angularVelocity = Math.abs(angleDiff / timeDiff);
                
                debugState.angleVelocity = angularVelocity;
                
                // Update display with angular velocity
                wristSpeedElement.textContent = `${angularVelocity.toFixed(0)}°/s`;
                
                // Check for forward shooting motion
                // For right hand: angle should progress from >90° (cocked back) to <90° (forward release)
                const isForwardMotion = angleDiff < 0 && recent.angle < 90 && previous.angle > 90;
                
                // Check all conditions for shot detection
                if (shotCooldown === 0 &&
                    wristAboveShoulder &&
                    isForwardMotion &&
                    angularVelocity > VELOCITY_THRESHOLD) {
                    
                    debugState.detectionState = 'Shot Detected!';
                    console.log(`SHOT DETECTED! Forward flick detected`);
                    console.log(`  Angle: ${previous.angle.toFixed(1)}° → ${recent.angle.toFixed(1)}°`);
                    console.log(`  Velocity: ${angularVelocity.toFixed(0)}°/s`);
                    triggerShotDetection();
                }
            }
        } else {
            // Clear angle history when wrist is below shoulder
            angleHistory.right = [];
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
    
    console.log('MediaPipe Holistic initialized - tracking with index finger');
    console.log('Detection requires: 1) Wrist above shoulder, 2) Angle > -90°, 3) Velocity > 300°/s');
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
    
    // Reset debug info
    updateDebugInfo({
        poseDetected: false,
        past90Degrees: false,
        wristAboveShoulder: false,
        currentAngle: null,
        angleVelocity: null,
        detectionState: 'Stopped'
    });
});