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

function onResults(results) {
    // Calculate FPS
    const currentTime = Date.now();
    const deltaTime = currentTime - lastTime;
    fps = Math.round(1000 / deltaTime);
    lastTime = currentTime;
    fpsElement.textContent = fps;

    // Clear canvas
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Draw the video
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (results.poseLandmarks) {
        // Draw skeleton
        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, {
            color: '#00FF00',
            lineWidth: 2
        });
        
        // Draw all landmarks
        drawLandmarks(canvasCtx, results.poseLandmarks, {
            color: '#FF0000',
            lineWidth: 1,
            radius: 3
        });

        // Get landmarks for shot detection
        // Wrists: 15 = left, 16 = right
        // Index fingers: 19 = left, 20 = right  
        // Shoulders: 11 = left, 12 = right
        const leftWrist = results.poseLandmarks[15];
        const rightWrist = results.poseLandmarks[16];
        const leftIndex = results.poseLandmarks[19];
        const rightIndex = results.poseLandmarks[20];
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

        // Calculate and display wrist speed
        calculateWristSpeed();
        
        // Check for basketball shot
        checkBasketballShot(results.poseLandmarks, currentTime);
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

function calculateWristSpeed() {
    let totalSpeed = 0;
    let count = 0;

    // Calculate speed for left wrist
    if (wristHistory.left.length >= 2) {
        const recent = wristHistory.left[wristHistory.left.length - 1];
        const previous = wristHistory.left[wristHistory.left.length - 2];
        const distance = Math.sqrt(
            Math.pow(recent.x - previous.x, 2) + 
            Math.pow(recent.y - previous.y, 2)
        );
        const timeDiff = (recent.time - previous.time) / 1000; // Convert to seconds
        const speed = distance / timeDiff;
        totalSpeed += speed;
        count++;
    }

    // Calculate speed for right wrist
    if (wristHistory.right.length >= 2) {
        const recent = wristHistory.right[wristHistory.right.length - 1];
        const previous = wristHistory.right[wristHistory.right.length - 2];
        const distance = Math.sqrt(
            Math.pow(recent.x - previous.x, 2) + 
            Math.pow(recent.y - previous.y, 2)
        );
        const timeDiff = (recent.time - previous.time) / 1000;
        const speed = distance / timeDiff;
        totalSpeed += speed;
        count++;
    }

    if (count > 0) {
        const avgSpeed = totalSpeed / count;
        wristSpeedElement.textContent = `${avgSpeed.toFixed(0)} px/s`;
    }
}

function checkBasketballShot(landmarks, currentTime) {
    // Decrease cooldown
    if (shotCooldown > 0) {
        shotCooldown--;
        return;
    }
    
    // Check both hands
    const hands = [
        { wrist: landmarks[15], index: landmarks[19], shoulder: landmarks[11], side: 'left' },
        { wrist: landmarks[16], index: landmarks[20], shoulder: landmarks[12], side: 'right' }
    ];
    
    for (const hand of hands) {
        // Check if wrist is above shoulder (y coordinates are inverted in normalized space)
        const wristAboveShoulder = hand.wrist.y < hand.shoulder.y;
        
        if (wristAboveShoulder) {
            // Calculate angle between wrist-index vector and horizontal
            const dx = hand.index.x - hand.wrist.x;
            const dy = hand.index.y - hand.wrist.y;
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            
            // Add to angle history
            angleHistory[hand.side].push({ angle, time: currentTime });
            
            // Keep history limited
            if (angleHistory[hand.side].length > 10) {
                angleHistory[hand.side].shift();
            }
            
            // Calculate angular velocity if we have enough history
            if (angleHistory[hand.side].length >= 3) {
                const recent = angleHistory[hand.side][angleHistory[hand.side].length - 1];
                const previous = angleHistory[hand.side][angleHistory[hand.side].length - 3];
                
                const angleDiff = recent.angle - previous.angle;
                const timeDiff = (recent.time - previous.time) / 1000; // seconds
                const angularVelocity = Math.abs(angleDiff / timeDiff);
                
                // Update display with angular velocity
                const speedElement = document.getElementById('wristSpeed');
                speedElement.textContent = `${angularVelocity.toFixed(0)}°/s`;
                
                // Check for shooting motion
                // Looking for downward flick (positive angle change) with high velocity
                if (angularVelocity > 300 && angleDiff > 0) {
                    // Additional check: ensure the motion is forward (towards palm side)
                    // In a shooting motion, the angle typically goes from negative to positive
                    if (previous.angle < 0 && recent.angle > previous.angle) {
                        triggerShotDetection();
                    }
                }
            }
        } else {
            // Clear angle history when wrist is below shoulder
            angleHistory[hand.side] = [];
        }
    }
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
});