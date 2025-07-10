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

        // Get wrist positions (indices: 15 = left wrist, 16 = right wrist)
        const leftWrist = results.poseLandmarks[15];
        const rightWrist = results.poseLandmarks[16];

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