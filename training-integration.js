// Training Integration - Bridge between PWA and existing MediaPipe code
let poseInstance = null;
let camera = null;
let shotCallback = null;

window.initializeMediaPipeTraining = async function(container, onShotDetected) {
    shotCallback = onShotDetected;
    
    // Create video and canvas elements
    const videoElement = document.createElement('video');
    videoElement.className = 'input_video';
    videoElement.style.display = 'none';
    
    const canvasElement = document.createElement('canvas');
    canvasElement.className = 'output_canvas';
    canvasElement.width = container.clientWidth;
    canvasElement.height = container.clientHeight;
    canvasElement.style.width = '100%';
    canvasElement.style.height = '100%';
    canvasElement.style.objectFit = 'cover';
    
    container.innerHTML = '';
    container.appendChild(videoElement);
    container.appendChild(canvasElement);
    
    const canvasCtx = canvasElement.getContext('2d');
    
    // Initialize MediaPipe Pose
    poseInstance = new Pose({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
        }
    });
    
    poseInstance.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
    
    // Set up pose detection callback
    poseInstance.onResults((results) => {
        onPoseResults(results, canvasElement, canvasCtx);
    });
    
    // Initialize camera
    camera = new Camera(videoElement, {
        onFrame: async () => {
            await poseInstance.send({ image: videoElement });
        },
        width: 1280,
        height: 720
    });
    
    camera.start();
    
    // Add start/stop button
    const controlBtn = document.createElement('button');
    controlBtn.className = 'btn btn-primary';
    controlBtn.style.position = 'absolute';
    controlBtn.style.bottom = '20px';
    controlBtn.style.left = '50%';
    controlBtn.style.transform = 'translateX(-50%)';
    controlBtn.style.zIndex = '10';
    controlBtn.textContent = 'Start Training';
    controlBtn.onclick = toggleTraining;
    container.appendChild(controlBtn);
};

// Simplified version of app.js onResults function
let isTraining = false;
let shotCount = 0;
let wristHistory = [];
let angleHistory = [];
let shotCooldown = 0;

function onPoseResults(results, canvas, ctx) {
    // Clear canvas
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw video
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    
    if (results.poseLandmarks && isTraining) {
        // Draw pose
        drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, {
            color: '#00FF00',
            lineWidth: 2
        });
        
        drawLandmarks(ctx, results.poseLandmarks, {
            color: '#FF0000',
            lineWidth: 1,
            radius: 3
        });
        
        // Shot detection logic (simplified from app.js)
        const rightWrist = results.poseLandmarks[16];
        const rightIndex = results.poseLandmarks[20];
        const nose = results.poseLandmarks[0];
        
        if (rightWrist && rightIndex && nose) {
            // Calculate angle
            const angle = calculateAngle(rightWrist, rightIndex);
            
            // Check conditions
            const wristAboveNose = rightWrist.y < nose.y;
            const angleInRange = angle > -90 && angle < 0;
            
            // Calculate angular velocity
            angleHistory.push({ angle, time: Date.now() });
            if (angleHistory.length > 10) angleHistory.shift();
            
            const velocity = calculateAngularVelocity(angleHistory);
            
            // Detect shot
            if (shotCooldown === 0 && wristAboveNose && angleInRange && velocity > 300) {
                shotDetected(velocity);
                shotCooldown = 30; // Frames cooldown
            }
        }
        
        if (shotCooldown > 0) shotCooldown--;
    }
    
    ctx.restore();
}

function calculateAngle(wrist, index) {
    const dx = index.x - wrist.x;
    const dy = index.y - wrist.y;
    return Math.atan2(dy, dx) * (180 / Math.PI);
}

function calculateAngularVelocity(history) {
    if (history.length < 2) return 0;
    
    const recent = history[history.length - 1];
    const previous = history[0];
    const timeDiff = (recent.time - previous.time) / 1000;
    const angleDiff = recent.angle - previous.angle;
    
    return Math.abs(angleDiff / timeDiff);
}

function shotDetected(velocity) {
    shotCount++;
    console.log(`Shot detected! Count: ${shotCount}, Velocity: ${velocity}°/s`);
    
    // Call the callback with shot data
    if (shotCallback) {
        shotCallback({
            velocity: Math.round(velocity),
            timestamp: Date.now(),
            shotNumber: shotCount
        });
    }
    
    // Visual feedback
    showShotFeedback();
}

function showShotFeedback() {
    const feedback = document.createElement('div');
    feedback.style.position = 'absolute';
    feedback.style.top = '50%';
    feedback.style.left = '50%';
    feedback.style.transform = 'translate(-50%, -50%)';
    feedback.style.fontSize = '48px';
    feedback.style.fontWeight = 'bold';
    feedback.style.color = '#00FF00';
    feedback.style.textShadow = '2px 2px 4px rgba(0,0,0,0.5)';
    feedback.style.zIndex = '100';
    feedback.textContent = `Shot ${shotCount}!`;
    
    document.querySelector('.video-container').appendChild(feedback);
    
    setTimeout(() => feedback.remove(), 1000);
}

function toggleTraining() {
    isTraining = !isTraining;
    const btn = document.querySelector('.video-container button');
    btn.textContent = isTraining ? 'Stop Training' : 'Start Training';
    
    if (isTraining) {
        shotCount = 0;
        wristHistory = [];
        angleHistory = [];
    }
}

// Clean up on page navigation
window.addEventListener('beforeunload', () => {
    if (camera) {
        camera.stop();
    }
    if (poseInstance) {
        poseInstance.close();
    }
});