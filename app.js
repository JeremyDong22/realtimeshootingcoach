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
const faceAngleElement = document.getElementById('faceAngle');
const shootingSideOkElement = document.getElementById('shootingSideOk');
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

// Initialize MediaPipe Pose
const pose = new Pose({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
    }
});

pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    smoothSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

pose.onResults(onResults);

function updateDebugInfo(state) {
    // Update debug panel
    poseDetectedElement.textContent = state.poseDetected ? 'Yes' : 'No';
    poseDetectedElement.className = state.poseDetected ? 'active' : '';
    
    faceAngleElement.textContent = state.faceAngle !== null ? `${state.faceAngle.toFixed(1)}°` : '-';
    
    shootingSideOkElement.textContent = state.shootingSideOk ? 'Yes' : 'No';
    shootingSideOkElement.className = state.shootingSideOk ? 'active' : '';
    
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
        faceAngle: null,
        shootingSideOk: false,
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

        // Get landmarks
        // Face: nose=0, left ear=7, right ear=8
        // Right side: wrist=16, pinky=18, shoulder=12, elbow=14
        // Left side: wrist=15, pinky=17, shoulder=11, elbow=13
        const nose = results.poseLandmarks[0];
        const leftEar = results.poseLandmarks[7];
        const rightEar = results.poseLandmarks[8];
        
        const rightWrist = results.poseLandmarks[16];
        const rightPinky = results.poseLandmarks[18];
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
        
        const rightPinkyCanvas = {
            x: rightPinky.x * canvasElement.width,
            y: rightPinky.y * canvasElement.height
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

        // Highlight wrists and pinky
        drawWrist(leftWristCanvas, '#FF00FF', 'L');
        drawWrist(rightWristCanvas, '#00FFFF', 'R');
        drawWrist(rightPinkyCanvas, '#FFD700', 'P'); // Draw pinky in gold

        // Check if right wrist is above shoulder
        const wristAboveShoulder = rightWrist.y < rightShoulder.y;
        debugState.wristAboveShoulder = wristAboveShoulder;

        // Check face orientation
        // Calculate face angle using ear positions
        const earDx = rightEar.x - leftEar.x;
        const earDz = rightEar.z - leftEar.z;
        const faceAngle = Math.atan2(earDx, earDz) * 180 / Math.PI;
        
        // Accept right-facing angles from -30° to +20°
        const shootingFromRightSide = faceAngle >= -30 && faceAngle <= 20;
        debugState.shootingSideOk = shootingFromRightSide;
        
        // Update debug state with face angle
        debugState.faceAngle = faceAngle;
        console.log(`Face angle: ${faceAngle.toFixed(1)}°`);

        if (wristAboveShoulder) {
            // Calculate angle between wrist-pinky vector
            const dx = rightPinky.x - rightWrist.x;
            const dy = rightPinky.y - rightWrist.y;
            
            // Calculate angle from horizontal
            // For right hand: -90° = up, 0° = right, 90° = down, ±180° = left
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            
            debugState.currentAngle = angle;
            // For right hand, past 90° means angle > 90 (pointing downward)
            debugState.past90Degrees = angle > 90;
            
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
                // For right hand: angle should progress from negative (cocked back) to positive (forward)
                // and pass through 90° (pointing down)
                const isForwardMotion = angleDiff > 0 && recent.angle > 90 && previous.angle < 90;
                
                // Check all conditions for shot detection
                if (shotCooldown === 0 &&
                    wristAboveShoulder &&
                    shootingFromRightSide &&
                    isForwardMotion &&
                    angularVelocity > VELOCITY_THRESHOLD) {
                    
                    debugState.detectionState = 'Shot Detected!';
                    console.log(`SHOT DETECTED! Forward flick detected`);
                    console.log(`  Angle: ${previous.angle.toFixed(1)}° → ${recent.angle.toFixed(1)}°`);
                    console.log(`  Velocity: ${angularVelocity.toFixed(0)}°/s`);
                    console.log(`  Face angle: ${faceAngle.toFixed(1)}°`);
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
            await pose.send({ image: videoElement });
        },
        width: 1280,
        height: 720
    });

    await camera.start();

    // Set canvas dimensions
    canvasElement.width = videoElement.videoWidth || 1280;
    canvasElement.height = videoElement.videoHeight || 720;
    
    console.log('MediaPipe Pose initialized - tracking with pinky finger');
    console.log('Detection requires: 1) Right side view, 2) Wrist above shoulder, 3) Angle > 90°, 4) Velocity > 300°/s');
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
        faceAngle: null,
        shootingSideOk: false,
        past90Degrees: false,
        wristAboveShoulder: false,
        currentAngle: null,
        angleVelocity: null,
        detectionState: 'Stopped'
    });
});