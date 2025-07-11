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
const MAX_HISTORY = 20; // For visual trail only

// Store longer wrist history for shot analysis (3 seconds)
const wristAnalysisHistory = [];
const MAX_ANALYSIS_HISTORY = 90; // 3 seconds at 30fps

// Store angle history for angular velocity calculation
const angleHistory = {
    left: [],
    right: []
};

// Shot detection state
let shotDetected = false;
let shotCooldown = 0;

// Shot analysis data
let shotAnalysisData = null;

// Video recording
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let frameBuffer = []; // Store frames for post-processing

// Configuration - focusing on right hand only
const SHOOTING_HAND = 'right';
const VELOCITY_THRESHOLD = 300; // degrees per second



// Find the U-shape bottom in right wrist trajectory
function findShotStart(wristHistory, releaseTime) {
    if (wristHistory.length < 10) {
        console.log('Not enough wrist history:', wristHistory.length);
        return null;
    }
    
    let lowestPoint = null;
    let lowestY = -Infinity;
    let candidates = [];
    
    // Look back up to 3 seconds from release
    const lookbackTime = releaseTime - 3000;
    console.log(`Looking for shot start between ${new Date(lookbackTime).toLocaleTimeString()} and ${new Date(releaseTime).toLocaleTimeString()}`);
    console.log(`Note: Only considering U-shapes when wrist is below shoulder`);
    
    // First pass: find all local minima (potential U-shape bottoms)
    for (let i = 1; i < wristHistory.length - 1; i++) {
        const point = wristHistory[i];
        if (point.time < lookbackTime) continue;
        if (point.time > releaseTime) break;
        
        const prevY = wristHistory[i - 1].y;
        const nextY = wristHistory[i + 1].y;
        
        // U-shape detected when both neighbors have lower Y (higher on screen)
        // Remember: Y increases downward in canvas coordinates
        // Only consider U-shapes when wrist is below shoulder (loading phase)
        if (point.y > prevY && point.y > nextY && point.belowShoulder) {
            candidates.push({
                ...point,
                index: i,
                depth: Math.min(point.y - prevY, point.y - nextY)
            });
        }
        
        // Track absolute lowest point (only when below shoulder)
        if (point.y > lowestY && point.belowShoulder) {
            lowestY = point.y;
            lowestPoint = point;
        }
    }
    
    console.log(`Found ${candidates.length} U-shape candidates`);
    
    // If we found U-shapes, return the nearest one to release (working backwards)
    if (candidates.length > 0) {
        // Log all candidates for debugging
        console.log('All U-shape candidates:');
        candidates.forEach((c, i) => {
            const timeFromRelease = (releaseTime - c.time) / 1000;
            console.log(`  ${i + 1}. Y=${Math.round(c.y)}, depth=${c.depth.toFixed(1)}, ${timeFromRelease.toFixed(2)}s before release`);
        });
        
        // Sort by time, closest to release first (latest time first)
        candidates.sort((a, b) => b.time - a.time);
        console.log(`\nSelected NEAREST U-shape to release:`);
        console.log(`  Y=${Math.round(candidates[0].y)}, time=${new Date(candidates[0].time).toLocaleTimeString()}`);
        console.log(`  Distance from release: ${((releaseTime - candidates[0].time) / 1000).toFixed(2)}s`);
        return { ...candidates[0], uShapeFound: true };
    }
    
    // Fallback: No U-shape found (catch and shoot scenario)
    // Use 3 seconds before release as the shot start
    console.log(`No clear U-shape found (catch and shoot). Using 3 seconds before release.`);
    
    // Find the frame closest to 3 seconds before release
    const targetTime = releaseTime - 3000;
    let closestFrame = null;
    let closestTimeDiff = Infinity;
    
    for (let i = 0; i < wristHistory.length; i++) {
        const frame = wristHistory[i];
        const timeDiff = Math.abs(frame.time - targetTime);
        if (timeDiff < closestTimeDiff) {
            closestTimeDiff = timeDiff;
            closestFrame = frame;
        }
    }
    
    if (closestFrame) {
        console.log(`  Using frame at ${new Date(closestFrame.time).toLocaleTimeString()}, ${((releaseTime - closestFrame.time) / 1000).toFixed(2)}s before release`);
        return { ...closestFrame, uShapeFound: false };
    }
    
    // Ultimate fallback: use the oldest frame we have
    if (wristHistory.length > 0) {
        const oldestFrame = wristHistory[0];
        console.log(`  Using oldest available frame at ${new Date(oldestFrame.time).toLocaleTimeString()}`);
        return { ...oldestFrame, uShapeFound: false };
    }
    
    return null;
}


// Initialize MediaPipe Pose
const pose = new Pose({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
    }
});

pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

pose.onResults(onResults);


function updateDebugInfo(state) {
    // Update debug panel
    poseDetectedElement.textContent = state.poseDetected ? 'Yes' : 'No';
    poseDetectedElement.className = state.poseDetected ? 'active' : '';
    
    // U-shape will be updated during shot analysis
    uShapeDetectedElement.textContent = state.uShapeDetected || '-';
    
    // Update shot analysis data if available
    // Show last shot data (not real-time)
    if (shotAnalysisData) {
        shotStartTimeElement.textContent = new Date(shotAnalysisData.startTime).toLocaleTimeString();
        shotDurationElement.textContent = `${shotAnalysisData.duration.toFixed(2)}s`;
        
        // Update U-shape status if we have shot data
        if (shotAnalysisData.uShapeFound) {
            uShapeDetectedElement.textContent = 'Yes';
            uShapeDetectedElement.className = 'active';
        }
    } else {
        shotStartTimeElement.textContent = '-';
        shotDurationElement.textContent = '-';
    }
    
    past90DegreesElement.textContent = state.past90Degrees ? 'Yes' : 'No';
    past90DegreesElement.className = state.past90Degrees ? 'active' : '';
    
    wristAboveShoulderElement.textContent = state.wristAboveShoulder ? 'Yes' : 'No';
    wristAboveShoulderElement.className = state.wristAboveShoulder ? 'active' : '';
    
    currentAngleElement.textContent = state.currentAngle !== null ? `${Math.round(state.currentAngle)}°` : '-';
    angleVelocityElement.textContent = state.angleVelocity ? `${Math.round(state.angleVelocity)}°/s` : '-';
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
        uShapeDetected: null,
    };
    
    // Wrist position for frame capture
    let rightWristCanvas = null;

    // Clear canvas
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Draw the video
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    
    // Frame will be captured at the end after all overlays are drawn
    
    // Basketball detection removed for performance

    if (results.poseLandmarks) {
        debugState.poseDetected = true;
        
        // Define body-only connections (skip face connections)
        const BODY_CONNECTIONS = [
            // Body connections
            [11, 12], // shoulders
            [11, 13], [13, 15], // left arm
            [12, 14], [14, 16], // right arm
            [11, 23], [12, 24], // torso to hips
            [23, 24], // hips
            [23, 25], [25, 27], // left leg
            [24, 26], [26, 28], // right leg
            // Hand connections for index fingers only
            [15, 19], // left wrist to left index
            [16, 20], // right wrist to right index
        ];
        
        // Draw pose skeleton
        drawConnectors(canvasCtx, results.poseLandmarks, BODY_CONNECTIONS, {
            color: '#00FF00',
            lineWidth: 2
        });
        
        // Draw only body landmarks (skip face points 0-10)
        const bodyLandmarks = results.poseLandmarks.filter((landmark, index) => {
            // Skip face landmarks (0-10) except for necessary body points
            // Keep body (11-22) and lower body (23-32)
            // Also keep hands (15-16 wrists, 19-20 index fingers)
            return index >= 11;
        });
        drawLandmarks(canvasCtx, bodyLandmarks, {
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
        const nose = results.poseLandmarks[0]; // Nose landmark
        
        const leftWrist = results.poseLandmarks[15];
        const leftShoulder = results.poseLandmarks[11];
        

        // Update wrist position display (rounded)
        leftWristElement.textContent = '-';
        rightWristElement.textContent = `x: ${Math.round(rightWrist.x * 1000)}, y: ${Math.round(rightWrist.y * 1000)}, z: ${Math.round(rightWrist.z * 1000)}`;

        // Convert normalized coordinates to canvas coordinates
        rightWristCanvas = {
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
        const wristData = {
            ...rightWristCanvas, 
            time: currentTime,
            belowShoulder: rightWrist.y > rightShoulder.y
        };
        
        wristHistory.right.push(wristData);
        wristHistory.left.push({...leftWristCanvas, time: currentTime});
        
        // Add to longer analysis history
        wristAnalysisHistory.push(wristData);

        // Keep histories limited
        if (wristHistory.right.length > MAX_HISTORY) wristHistory.right.shift();
        if (wristHistory.left.length > MAX_HISTORY) wristHistory.left.shift();
        if (wristAnalysisHistory.length > MAX_ANALYSIS_HISTORY) wristAnalysisHistory.shift();

        // Draw only right wrist trail in cool blue
        drawWristTrail(wristHistory.right, '#0080FF');

        // Highlight only right wrist and index finger
        drawWrist(rightWristCanvas, '#0080FF', 'R');
        drawWrist(rightIndexCanvas, '#FFD700', 'I'); // Draw index in gold

        // Check if right wrist is above nose
        const wristAboveNose = rightWrist.y < nose.y;
        debugState.wristAboveShoulder = wristAboveNose; // Keep variable name for compatibility


        if (wristAboveNose) {
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
                wristSpeedElement.textContent = `${Math.round(angularVelocity)}°/s`;
                
                // Check for forward shooting motion
                // For right hand: angle should progress from <-90° (cocked back) to >-90° (forward release)
                // Example: -100° → -90° → -80° (passing through vertical upward)
                const isForwardMotion = angleDiff > 0 && recent.angle > -90 && previous.angle < -90;
                
                // Check all conditions for shot detection
                // Ensure the recent angle (where we ended up) is in the valid shooting range
                const recentAngleInRange = recent.angle > -90 && recent.angle < 0;
                
                if (shotCooldown === 0 &&
                    wristAboveNose &&
                    recentAngleInRange &&
                    isForwardMotion &&
                    angularVelocity > VELOCITY_THRESHOLD) {
                    
                    debugState.detectionState = 'Shot Detected!';
                    console.log(`SHOT DETECTED! Forward flick detected`);
                    console.log(`  Angle: ${Math.round(previous.angle)}° → ${Math.round(recent.angle)}°`);
                    console.log(`  Velocity: ${Math.round(angularVelocity)}°/s`);
                    
                    // Analyze shot start using longer wrist analysis history
                    const shotStart = findShotStart(wristAnalysisHistory, currentTime);
                    if (shotStart) {
                        const shotDuration = (currentTime - shotStart.time) / 1000; // in seconds
                        shotAnalysisData = {
                            startTime: shotStart.time,
                            releaseTime: currentTime,
                            duration: shotDuration,
                            startPosition: { x: shotStart.x, y: shotStart.y },
                            uShapeFound: shotStart.uShapeFound || false
                        };
                        console.log(`  Shot duration: ${shotDuration.toFixed(2)}s`);
                        console.log(`  Start position: (${Math.round(shotStart.x)}, ${Math.round(shotStart.y)})`);
                        if (shotStart.uShapeFound) {
                            console.log(`  Shot start found at wrist U-shape bottom`);
                        } else {
                            console.log(`  No U-shape found - using ${shotDuration < 3 ? 'oldest available' : '3 second'} cutoff`);
                        }
                        console.log(`  Analysis history length: ${wristAnalysisHistory.length} frames`);
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
    
    // Capture frame with all overlays for recording
    if (frameBuffer.length >= 90) { // Keep 3 seconds at 30fps
        frameBuffer.shift();
    }
    
    // Store complete frame data including overlays
    frameBuffer.push({
        imageData: canvasCtx.getImageData(0, 0, canvasElement.width, canvasElement.height),
        time: currentTime,
        debugInfo: {
            poseDetected: debugState.poseDetected,
            wristAngle: debugState.currentAngle,
            angleVelocity: debugState.angleVelocity,
            wristAboveShoulder: debugState.wristAboveShoulder,
            past90Degrees: debugState.past90Degrees,
            detectionState: debugState.detectionState,
            rightWristPos: rightWristCanvas ? { x: rightWristCanvas.x, y: rightWristCanvas.y } : null
        }
    });
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
        
        // Wait 300ms to capture post-release frames, then save debug video
        if (shotAnalysisData && frameBuffer.length > 0) {
            setTimeout(() => {
                console.log('Saving debug video after 300ms delay to capture follow-through');
                saveDebugVideo();
            }, 300);
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
    
    // Find frames from shot start to release WITH PADDING
    const startTime = shotAnalysisData.startTime;
    const endTime = shotAnalysisData.releaseTime;
    
    // Add 300ms padding before and after for better viewing
    const paddedStartTime = startTime - 300;
    const paddedEndTime = endTime + 300;
    
    // Filter frames within the PADDED period
    const shotFrames = frameBuffer.filter(frame => 
        frame.time >= paddedStartTime && frame.time <= paddedEndTime
    );
    
    console.log(`Found ${shotFrames.length} frames from padded shot period`);
    console.log(`Shot duration: ${((endTime - startTime) / 1000).toFixed(2)}s`);
    console.log(`Video duration with padding: ${((paddedEndTime - paddedStartTime) / 1000).toFixed(2)}s`);
    
    // Play back frames at 30fps
    let frameIndex = 0;
    const playbackInterval = setInterval(() => {
        if (frameIndex >= shotFrames.length) {
            // Stop recording immediately after last frame
            clearInterval(playbackInterval);
            recorder.stop();
            return;
        }
        
        // Draw the frame with all overlays
        const frame = shotFrames[frameIndex];
        videoCtx.putImageData(frame.imageData, 0, 0);
        
        // Add debug info overlay
        videoCtx.save();
        
        // Top info bar
        videoCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        videoCtx.fillRect(0, 0, videoCanvas.width, 30);
        videoCtx.fillStyle = '#FFFFFF';
        videoCtx.font = '14px Arial';
        videoCtx.fillText(`Frame ${frameIndex + 1}/${shotFrames.length} - ${new Date(frame.time).toLocaleTimeString()}`, 10, 20);
        
        // Show shot duration on the right side of top bar
        videoCtx.fillStyle = '#FFD700';
        videoCtx.font = 'bold 14px Arial';
        videoCtx.textAlign = 'right';
        videoCtx.fillText(`Shot Duration: ${shotAnalysisData.duration.toFixed(2)}s`, videoCanvas.width - 10, 20);
        videoCtx.textAlign = 'left'; // Reset alignment
        
        // Right side debug panel
        if (frame.debugInfo) {
            videoCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            videoCtx.fillRect(videoCanvas.width - 200, 40, 190, 140); // Increased height
            
            videoCtx.fillStyle = '#00FF00';
            videoCtx.font = '12px Arial';
            let yPos = 60;
            
            if (frame.debugInfo.wristAngle !== null) {
                videoCtx.fillText(`Angle: ${Math.round(frame.debugInfo.wristAngle)}°`, videoCanvas.width - 190, yPos);
                yPos += 20;
            }
            
            if (frame.debugInfo.angleVelocity) {
                videoCtx.fillText(`Speed: ${Math.round(frame.debugInfo.angleVelocity)}°/s`, videoCanvas.width - 190, yPos);
                yPos += 20;
            }
            
            videoCtx.fillText(`Above Nose: ${frame.debugInfo.wristAboveShoulder ? 'Yes' : 'No'}`, videoCanvas.width - 190, yPos);
            yPos += 20;
            
            videoCtx.fillText(`Past -90°: ${frame.debugInfo.past90Degrees ? 'Yes' : 'No'}`, videoCanvas.width - 190, yPos);
            yPos += 20;
            
            if (frame.debugInfo.detectionState && frame.debugInfo.detectionState !== 'Idle') {
                videoCtx.fillStyle = '#FFD700';
                videoCtx.fillText(frame.debugInfo.detectionState, videoCanvas.width - 190, yPos);
            }
            
            // Show elapsed time from shot start
            if (frame.time >= shotAnalysisData.startTime) {
                yPos += 20;
                const elapsedTime = (frame.time - shotAnalysisData.startTime) / 1000;
                videoCtx.fillStyle = '#00BFFF';
                videoCtx.fillText(`Elapsed: ${elapsedTime.toFixed(2)}s`, videoCanvas.width - 190, yPos);
            }
        }
        
        // Mark shot start and release frames
        if (Math.abs(frame.time - shotAnalysisData.startTime) < 50) {
            videoCtx.strokeStyle = '#00FF00';
            videoCtx.lineWidth = 4;
            videoCtx.strokeRect(2, 2, videoCanvas.width - 4, videoCanvas.height - 4);
            videoCtx.fillStyle = '#00FF00';
            videoCtx.font = 'bold 20px Arial';
            videoCtx.fillText('SHOT START', 10, videoCanvas.height - 20);
        } else if (Math.abs(frame.time - shotAnalysisData.releaseTime) < 50) {
            videoCtx.strokeStyle = '#FF0000';
            videoCtx.lineWidth = 4;
            videoCtx.strokeRect(2, 2, videoCanvas.width - 4, videoCanvas.height - 4);
            videoCtx.fillStyle = '#FF0000';
            videoCtx.font = 'bold 20px Arial';
            videoCtx.fillText('RELEASE', 10, videoCanvas.height - 20);
        }
        
        videoCtx.restore();
        
        frameIndex++;
    }, 33); // ~30fps
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
    
    console.log('MediaPipe Pose initialized - tracking with index finger');
    console.log('Detection requires: 1) Wrist above nose, 2) Angle > -90°, 3) Velocity > 300°/s');
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
    wristAnalysisHistory.length = 0;
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
    
    // Clear shot data
    shotAnalysisData = null;
    frameBuffer.length = 0;
});