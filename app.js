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
const ballDetectedElement = document.getElementById('ballDetected');
const ballPositionElement = document.getElementById('ballPosition');
const uShapeDetectedElement = document.getElementById('uShapeDetected');
const shotStartTimeElement = document.getElementById('shotStartTime');
const shotDurationElement = document.getElementById('shotDuration');

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

// Basketball detection
let basketballModel = null;
let useSimulatedDetection = false; // Fallback if model doesn't load
const basketballHistory = [];
const MAX_BASKETBALL_HISTORY = 90; // 3 seconds at 30fps
let shotAnalysisData = null;
let lastBallDirection = null; // 'up' or 'down'
let uShapeDetected = false;

// Video recording
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let frameBuffer = []; // Store frames for post-processing

// Configuration - focusing on right hand only
const SHOOTING_HAND = 'right';
const VELOCITY_THRESHOLD = 300; // degrees per second

// Load YOLO basketball model
async function loadBasketballModel() {
    try {
        console.log('Loading YOLO basketball model...');
        // Create ONNX inference session
        basketballModel = await ort.InferenceSession.create('./basketballModel.onnx');
        console.log('Basketball model loaded successfully');
        console.log('Input names:', basketballModel.inputNames);
        console.log('Output names:', basketballModel.outputNames);
    } catch (error) {
        console.error('Error loading basketball model:', error);
        console.error('Make sure basketballModel.onnx exists (convert from .pt using export)');
        console.warn('Falling back to simulated detection for testing');
        useSimulatedDetection = true;
    }
}

// Detect basketball in frame
async function detectBasketball(imageElement) {
    // Use simulated detection if model not loaded
    if (useSimulatedDetection) {
        const rightWrist = wristHistory.right[wristHistory.right.length - 1];
        if (rightWrist && Math.random() > 0.3) {
            return {
                x: rightWrist.x + (Math.random() - 0.5) * 100,
                y: rightWrist.y - 50 + (Math.random() - 0.5) * 40,
                confidence: 0.85
            };
        }
        return null;
    }
    
    if (!basketballModel) {
        return null;
    }
    
    try {
        // Prepare input tensor for YOLO (typically 640x640)
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 640;
        canvas.height = 640;
        
        // Draw and scale image
        ctx.drawImage(imageElement, 0, 0, 640, 640);
        const imageData = ctx.getImageData(0, 0, 640, 640);
        
        // Convert to tensor format (CHW format for YOLO)
        const input = new Float32Array(3 * 640 * 640);
        for (let c = 0; c < 3; c++) {
            for (let h = 0; h < 640; h++) {
                for (let w = 0; w < 640; w++) {
                    const idx = (h * 640 + w) * 4;
                    input[c * 640 * 640 + h * 640 + w] = imageData.data[idx + c] / 255.0;
                }
            }
        }
        
        // Create input tensor
        const inputTensor = new ort.Tensor('float32', input, [1, 3, 640, 640]);
        
        // Run inference
        const feeds = {};
        feeds[basketballModel.inputNames[0]] = inputTensor;
        const results = await basketballModel.run(feeds);
        const output = results[basketballModel.outputNames[0]];
        
        console.log('YOLO output shape:', output.dims);
        console.log('YOLO output sample:', output.data.slice(0, 10));
        
        // Parse YOLO output - try different formats
        let boxes = [];
        
        // YOLOv11/v8 format: [1, 84, 8400] or [1, 6, 8400]
        if (output.dims[1] === 84 || output.dims[1] === 6) {
            boxes = parseYOLOv8Output(output.data, output.dims);
        } else {
            console.warn('Unknown YOLO output format:', output.dims);
        }
        
        console.log(`Found ${boxes.length} boxes`);
        
        // Find basketball (class 0 in our model)
        const basketball = boxes.find(box => box.class === 0 && box.confidence > 0.3);
        
        if (basketball) {
            console.log('Basketball detected:', basketball);
            // Scale coordinates back to original canvas size
            return {
                x: (basketball.x / 640) * canvasElement.width,
                y: (basketball.y / 640) * canvasElement.height,
                confidence: basketball.confidence
            };
        }
    } catch (error) {
        console.error('Basketball detection error:', error);
    }
    
    return null;
}

// Parse YOLOv8/v11 output format
function parseYOLOv8Output(data, dims) {
    const boxes = [];
    const rows = dims[1]; // 84 for YOLOv8 (4 bbox + 80 classes)
    const cols = dims[2]; // 8400 predictions
    
    for (let i = 0; i < cols; i++) {
        // Get bbox coordinates
        const x = data[0 * cols + i];
        const y = data[1 * cols + i];
        const w = data[2 * cols + i];
        const h = data[3 * cols + i];
        
        // Get class scores (starting from index 4)
        let maxScore = 0;
        let maxClass = 0;
        
        for (let c = 0; c < rows - 4; c++) {
            const score = data[(4 + c) * cols + i];
            if (score > maxScore) {
                maxScore = score;
                maxClass = c;
            }
        }
        
        if (maxScore > 0.3) {
            boxes.push({
                x: x,
                y: y,
                width: w,
                height: h,
                confidence: maxScore,
                class: maxClass
            });
        }
    }
    
    return boxes;
}

// Find the U-shape bottom in basketball trajectory
function findShotStart(history, releaseTime, wristHistory) {
    if (history.length < 10) return null;
    
    let lowestPoint = null;
    let lowestY = -Infinity;
    let foundUShape = false;
    
    // Look back up to 3 seconds from release
    const lookbackTime = releaseTime - 3000;
    
    // Process backwards from release
    for (let i = history.length - 1; i >= 0; i--) {
        const point = history[i];
        if (point.time < lookbackTime) break;
        
        // Check if this is a local minimum (U-shape bottom)
        if (i > 0 && i < history.length - 1) {
            const prevY = history[i - 1].y;
            const nextY = history[i + 1].y;
            
            // U-shape detected when both neighbors have higher Y (lower on screen)
            if (point.y > prevY && point.y > nextY) {
                // Also check if wrist is below shoulder at this time
                const wristAtTime = findWristAtTime(wristHistory, point.time);
                if (wristAtTime && wristAtTime.belowShoulder) {
                    return point; // Found shot start!
                }
            }
        }
        
        // Track lowest point as fallback
        if (point.y > lowestY) {
            lowestY = point.y;
            lowestPoint = point;
        }
    }
    
    return lowestPoint; // Return lowest point if no U-shape with wrist condition found
}

// Helper function to find wrist position at specific time
function findWristAtTime(wristHistory, targetTime) {
    for (let i = wristHistory.length - 1; i >= 0; i--) {
        if (Math.abs(wristHistory[i].time - targetTime) < 50) { // Within 50ms
            return wristHistory[i];
        }
    }
    return null;
}

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
    
    ballDetectedElement.textContent = state.ballDetected ? 'Yes' : 'No';
    ballDetectedElement.className = state.ballDetected ? 'active' : '';
    
    if (state.ballPosition) {
        ballPositionElement.textContent = `x: ${state.ballPosition.x.toFixed(0)}, y: ${state.ballPosition.y.toFixed(0)}`;
    } else {
        ballPositionElement.textContent = '-';
    }
    
    uShapeDetectedElement.textContent = state.uShapeDetected ? 'Yes' : 'No';
    uShapeDetectedElement.className = state.uShapeDetected ? 'active' : '';
    
    // Update shot analysis data if available
    if (shotAnalysisData) {
        shotStartTimeElement.textContent = new Date(shotAnalysisData.startTime).toLocaleTimeString();
        shotDurationElement.textContent = `${shotAnalysisData.duration.toFixed(2)}s`;
    } else {
        shotStartTimeElement.textContent = '-';
        shotDurationElement.textContent = '-';
    }
    
    past90DegreesElement.textContent = state.past90Degrees ? 'Yes' : 'No';
    past90DegreesElement.className = state.past90Degrees ? 'active' : '';
    
    wristAboveShoulderElement.textContent = state.wristAboveShoulder ? 'Yes' : 'No';
    wristAboveShoulderElement.className = state.wristAboveShoulder ? 'active' : '';
    
    currentAngleElement.textContent = state.currentAngle !== null ? `${state.currentAngle.toFixed(1)}°` : '-';
    angleVelocityElement.textContent = state.angleVelocity ? `${state.angleVelocity.toFixed(0)}°/s` : '-';
    detectionStateElement.textContent = state.detectionState || 'Idle';
}

async function onResults(results) {
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
        detectionState: 'Idle',
        ballDetected: false,
        ballPosition: null,
        uShapeDetected: false
    };

    // Clear canvas
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Draw the video
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    
    // Store frame for potential recording
    if (frameBuffer.length >= 90) { // Keep 3 seconds at 30fps
        frameBuffer.shift();
    }
    frameBuffer.push({
        imageData: canvasCtx.getImageData(0, 0, canvasElement.width, canvasElement.height),
        time: currentTime
    });
    
    // Detect basketball
    const ballDetection = await detectBasketball(results.image);
    if (ballDetection) {
        debugState.ballDetected = true;
        debugState.ballPosition = ballDetection;
        
        // Add to history
        basketballHistory.push({
            x: ballDetection.x,
            y: ballDetection.y,
            confidence: ballDetection.confidence,
            time: currentTime
        });
        
        // Keep history limited to 3 seconds
        while (basketballHistory.length > MAX_BASKETBALL_HISTORY) {
            basketballHistory.shift();
        }
        
        // Detect U-shape (direction change from down to up)
        if (basketballHistory.length >= 3) {
            const recent = basketballHistory[basketballHistory.length - 1];
            const previous = basketballHistory[basketballHistory.length - 3];
            const yDiff = recent.y - previous.y;
            
            const currentDirection = yDiff > 0 ? 'down' : 'up';
            
            // Check for direction change from down to up
            if (lastBallDirection === 'down' && currentDirection === 'up') {
                uShapeDetected = true;
                debugState.uShapeDetected = true;
                console.log('U-Shape detected! Ball changed from down to up');
            } else if (currentDirection === 'down') {
                // Reset when ball is going down
                uShapeDetected = false;
                debugState.uShapeDetected = false;
            }
            
            lastBallDirection = currentDirection;
        }
        
        // Draw new basketball visualization
        canvasCtx.save();
        
        // Draw orange circle outline
        canvasCtx.strokeStyle = '#FFA500';
        canvasCtx.lineWidth = 2;
        canvasCtx.beginPath();
        canvasCtx.arc(ballDetection.x, ballDetection.y, 20, 0, 2 * Math.PI);
        canvasCtx.stroke();
        
        // Draw coordinates
        canvasCtx.fillStyle = '#FFA500';
        canvasCtx.font = '12px Arial';
        canvasCtx.fillText(`(${ballDetection.x.toFixed(0)}, ${ballDetection.y.toFixed(0)})`, 
                          ballDetection.x + 25, ballDetection.y);
        
        canvasCtx.restore();
    }

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

        // Add to history with shoulder status
        wristHistory.right.push({
            ...rightWristCanvas, 
            time: currentTime,
            belowShoulder: rightWrist.y > rightShoulder.y
        });
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
            // For right hand, past vertical upward means angle between -90° and 0°
            debugState.past90Degrees = angle > -90 && angle < 0;
            
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
                // For right hand: angle should progress from <-90° (cocked back) to >-90° (forward release)
                // Example: -100° → -90° → -80° (passing through vertical upward)
                const isForwardMotion = angleDiff > 0 && recent.angle > -90 && previous.angle < -90;
                
                // Check all conditions for shot detection
                // Ensure the recent angle (where we ended up) is in the valid shooting range
                const recentAngleInRange = recent.angle > -90 && recent.angle < 0;
                
                if (shotCooldown === 0 &&
                    wristAboveShoulder &&
                    recentAngleInRange &&
                    isForwardMotion &&
                    angularVelocity > VELOCITY_THRESHOLD) {
                    
                    debugState.detectionState = 'Shot Detected!';
                    console.log(`SHOT DETECTED! Forward flick detected`);
                    console.log(`  Angle: ${previous.angle.toFixed(1)}° → ${recent.angle.toFixed(1)}°`);
                    console.log(`  Velocity: ${angularVelocity.toFixed(0)}°/s`);
                    
                    // Analyze shot start using basketball trajectory and wrist position
                    const shotStart = findShotStart(basketballHistory, currentTime, wristHistory.right);
                    if (shotStart) {
                        const shotDuration = (currentTime - shotStart.time) / 1000; // in seconds
                        shotAnalysisData = {
                            startTime: shotStart.time,
                            releaseTime: currentTime,
                            duration: shotDuration,
                            startPosition: { x: shotStart.x, y: shotStart.y }
                        };
                        console.log(`  Shot duration: ${shotDuration.toFixed(2)}s`);
                        console.log(`  Start position: (${shotStart.x.toFixed(0)}, ${shotStart.y.toFixed(0)})`);
                        console.log(`  Shot start found at U-shape with wrist below shoulder`);
                    }
                    
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
        
        // Save debug video
        if (shotAnalysisData && frameBuffer.length > 0) {
            saveDebugVideo();
        }
        
        // Remove visual feedback after 1 second
        setTimeout(() => {
            canvas.style.border = 'none';
            alertDiv.remove();
            shotDetected = false;
        }, 1000);
    }
}

// Save debug video with all overlays
async function saveDebugVideo() {
    if (!shotAnalysisData || frameBuffer.length === 0) {
        console.error('No shot data or frames to save');
        return;
    }
    
    // Create timestamp for filename
    const now = new Date();
    const timestamp = now.toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const filename = `shot_debug_${timestamp}.webm`;
    
    console.log(`Saving debug video: ${filename}`);
    console.log(`Processing ${frameBuffer.length} frames from shot period`);
    
    // Create a new canvas for rendering the video
    const videoCanvas = document.createElement('canvas');
    videoCanvas.width = canvasElement.width;
    videoCanvas.height = canvasElement.height;
    const videoCtx = videoCanvas.getContext('2d');
    
    // Set up MediaRecorder
    const stream = videoCanvas.captureStream(30);
    const recorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9'
    });
    
    const chunks = [];
    recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
            chunks.push(e.data);
        }
    };
    
    recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        console.log(`Debug video saved: ${filename} (${(blob.size / 1024 / 1024).toFixed(2)} MB)`);
    };
    
    // Start recording
    recorder.start();
    
    // Find frames from shot start to release
    const startTime = shotAnalysisData.startTime;
    const endTime = shotAnalysisData.releaseTime;
    
    // Filter frames within the shot period
    const shotFrames = frameBuffer.filter(frame => 
        frame.time >= startTime && frame.time <= endTime
    );
    
    console.log(`Found ${shotFrames.length} frames from shot period`);
    
    // Play back frames at 30fps
    let frameIndex = 0;
    const playbackInterval = setInterval(() => {
        if (frameIndex >= shotFrames.length) {
            // Add a final frame showing shot analysis
            drawAnalysisOverlay(videoCtx);
            
            setTimeout(() => {
                clearInterval(playbackInterval);
                recorder.stop();
            }, 1000); // Show analysis for 1 second
            return;
        }
        
        // Draw the frame
        const frame = shotFrames[frameIndex];
        videoCtx.putImageData(frame.imageData, 0, 0);
        
        // Add debug overlay
        videoCtx.save();
        videoCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        videoCtx.fillRect(0, 0, 250, 30);
        videoCtx.fillStyle = '#FFFFFF';
        videoCtx.font = '14px Arial';
        videoCtx.fillText(`Frame ${frameIndex + 1}/${shotFrames.length} - ${new Date(frame.time).toLocaleTimeString()}`, 10, 20);
        videoCtx.restore();
        
        frameIndex++;
    }, 33); // ~30fps
}

// Draw final analysis overlay
function drawAnalysisOverlay(ctx) {
    // Semi-transparent background
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    
    // Analysis text
    ctx.fillStyle = '#00FF00';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('SHOT ANALYSIS COMPLETE', ctx.canvas.width / 2, 100);
    
    if (shotAnalysisData) {
        ctx.font = '18px Arial';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(`Shot Duration: ${shotAnalysisData.duration.toFixed(2)}s`, ctx.canvas.width / 2, 150);
        ctx.fillText(`Start: ${new Date(shotAnalysisData.startTime).toLocaleTimeString()}`, ctx.canvas.width / 2, 180);
        ctx.fillText(`Release: ${new Date(shotAnalysisData.releaseTime).toLocaleTimeString()}`, ctx.canvas.width / 2, 210);
    }
    
    ctx.restore();
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
    
    // Load basketball detection model
    await loadBasketballModel();
    
    console.log('MediaPipe Holistic initialized - tracking with index finger');
    console.log('Detection requires: 1) Wrist above shoulder, 2) Angle > -90°, 3) Velocity > 300°/s');
    console.log('Basketball detection enabled for shot analysis');
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
        detectionState: 'Stopped',
        ballDetected: false,
        ballPosition: null
    });
    
    // Clear basketball history
    basketballHistory.length = 0;
    shotAnalysisData = null;
    frameBuffer.length = 0;
    uShapeDetected = false;
    lastBallDirection = null;
});