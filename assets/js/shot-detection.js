// Shot Detection Module - Unified tracking system for all training modes
// Changes:
// - Modular architecture for shot detection and analysis
// - Unified data tracking pipeline for all features
// - Post-processing analysis for advanced metrics
// - Support for both basic and professional training modes

// Stability level thresholds for toe displacement
const STABILITY_LEVELS = {
    perfect: { max: 0.1, color: '#00ff00', label: 'Perfect' },
    great: { max: 0.2, color: '#007bff', label: 'Great' },  // Changed to blue
    ok: { max: 0.3, color: '#FFD700', label: 'OK' },
    bad: { max: 0.4, color: '#FF0000', label: 'Bad' },      // Changed to red
    veryBad: { max: Infinity, color: '#FF0000', label: 'Very Bad' }  // Already red
};

// Shot detection parameters
const SHOT_DETECTION_CONFIG = {
    VELOCITY_THRESHOLD: 300, // degrees per second
    ANGLE_RANGE: { min: -135, max: -45 }, // degrees
    COOLDOWN_FRAMES: 30, // 1 second at 30fps
    FRAME_BUFFER_SIZE: 90, // 3 seconds at 30fps
    SHOT_PADDING: 700, // milliseconds to wait after shot detection
    VIDEO_PADDING: { before: 700, after: 700 } // milliseconds
};

export const ShotDetection = {
    // Universal data trackers - collect ALL data for every frame
    dataTrackers: {
        // Basic tracking (always active)
        wrist: {
            track(landmarks, isLeftHanded) {
                const wrist = isLeftHanded ? landmarks[15] : landmarks[16];
                const elbow = isLeftHanded ? landmarks[13] : landmarks[14];
                const shoulder = isLeftHanded ? landmarks[11] : landmarks[12];
                
                // Calculate wrist angle
                const shoulderToElbow = {
                    x: elbow.x - shoulder.x,
                    y: elbow.y - shoulder.y
                };
                const elbowToWrist = {
                    x: wrist.x - elbow.x,
                    y: wrist.y - elbow.y
                };
                
                const angle = Math.atan2(elbowToWrist.y, elbowToWrist.x) - 
                             Math.atan2(shoulderToElbow.y, shoulderToElbow.x);
                const angleDegrees = (angle * 180 / Math.PI + 360) % 360;
                const normalizedAngle = angleDegrees > 180 ? angleDegrees - 360 : angleDegrees;
                
                return {
                    position: { x: wrist.x, y: wrist.y },
                    angle: normalizedAngle,
                    timestamp: Date.now()
                };
            },
            required: true
        },
        
        // Advanced tracking (collected but used selectively)
        knee: {
            track(landmarks, isLeftHanded) {
                const knee = isLeftHanded ? landmarks[25] : landmarks[26];
                const hip = isLeftHanded ? landmarks[23] : landmarks[24];
                const ankle = isLeftHanded ? landmarks[27] : landmarks[28];
                
                return {
                    position: { x: knee.x, y: knee.y },
                    hipY: hip.y,
                    ankleY: ankle.y,
                    timestamp: Date.now()
                };
            },
            required: false
        },
        
        foot: {
            track(landmarks, isLeftHanded) {
                const heel = isLeftHanded ? landmarks[29] : landmarks[30];
                const footIndex = isLeftHanded ? landmarks[31] : landmarks[32];
                const ankle = isLeftHanded ? landmarks[27] : landmarks[28];
                
                // Calculate heel-to-toe angle
                const heelToToe = {
                    x: footIndex.x - heel.x,
                    y: footIndex.y - heel.y
                };
                const angle = Math.atan2(heelToToe.y, heelToToe.x) * 180 / Math.PI;
                
                return {
                    heel: { x: heel.x, y: heel.y },
                    toe: { x: footIndex.x, y: footIndex.y },
                    ankle: { x: ankle.x, y: ankle.y },
                    angle: angle,
                    timestamp: Date.now()
                };
            },
            required: false
        },
        
        toe: {
            track(landmarks, isLeftHanded) {
                // Use foot index (toe tip) - MediaPipe indices 31/32
                const footIndex = isLeftHanded ? landmarks[31] : landmarks[32];
                
                // Calculate thigh length for normalization (hip to knee)
                const hip = isLeftHanded ? landmarks[23] : landmarks[24];
                const knee = isLeftHanded ? landmarks[25] : landmarks[26];
                
                const thighLength = Math.sqrt(
                    Math.pow(knee.x - hip.x, 2) +
                    Math.pow(knee.y - hip.y, 2)
                );
                
                // Also store upper body length for backward compatibility
                const rightHip = landmarks[24];
                const rightShoulder = landmarks[12];
                const upperBodyLength = Math.sqrt(
                    Math.pow(rightShoulder.x - rightHip.x, 2) +
                    Math.pow(rightShoulder.y - rightHip.y, 2)
                );
                
                return {
                    position: { x: footIndex.x, y: footIndex.y },
                    thighLength: thighLength,
                    upperBodyLength: upperBodyLength,
                    timestamp: Date.now()
                };
            },
            required: false
        }
    },

    // Main tracking function - runs for EVERY frame
    trackFrame(landmarks, isLeftHanded = false) {
        const frameData = {
            timestamp: Date.now(),
            trackers: {}
        };
        
        // Collect ALL tracking data
        for (const [name, tracker] of Object.entries(this.dataTrackers)) {
            try {
                frameData.trackers[name] = tracker.track(landmarks, isLeftHanded);
            } catch (err) {
                console.warn(`Tracker ${name} failed:`, err);
                frameData.trackers[name] = null;
            }
        }
        
        // Debug log to verify trackers are populated
        const hasKnee = !!frameData.trackers.knee;
        const hasToe = !!frameData.trackers.toe;
        if (!hasKnee || !hasToe) {
            console.log('Missing trackers:', { hasKnee, hasToe, trackers: Object.keys(frameData.trackers) });
        }
        
        return frameData;
    },

    // Find shot boundaries based on wrist trajectory
    findShotBoundaries(frameHistory, currentTime) {
        if (frameHistory.length < 10) return null;
        
        // Extract wrist data
        const wristData = frameHistory
            .filter(f => f.trackers.wrist)
            .map(f => ({
                ...f.trackers.wrist,
                time: f.timestamp
            }));
        
        if (wristData.length < 10) return null;
        
        // Find release point (current time is when shot was detected)
        const releaseIdx = wristData.length - 1;
        const releaseData = wristData[releaseIdx];
        
        // Find U-shape start (look back up to 3 seconds)
        const lookbackTime = currentTime - 3000;
        let shotStartIdx = -1;
        let shotStartData = null;
        
        // Look for U-shape bottom (local minimum in Y)
        for (let i = releaseIdx - 5; i >= 1; i--) {
            if (wristData[i].time < lookbackTime) break;
            
            const prevY = wristData[i - 1].position.y;
            const currentY = wristData[i].position.y;
            const nextY = wristData[i + 1].position.y;
            
            // Found local minimum (U-shape bottom)
            if (currentY > prevY && currentY > nextY) {
                shotStartIdx = i;
                shotStartData = wristData[i];
                break;
            }
        }
        
        if (!shotStartData) {
            // Fallback: use time-based estimate
            shotStartIdx = Math.max(0, releaseIdx - 30); // ~1 second before
            shotStartData = wristData[shotStartIdx];
        }
        
        return {
            start: shotStartIdx,
            end: releaseIdx,
            startTime: shotStartData.time,
            endTime: releaseData.time,
            uShapeFound: shotStartIdx !== Math.max(0, releaseIdx - 30)
        };
    },

    // Analyze knee movement for U-shapes
    analyzeKneeMovement(shotFrames, releaseTime = null) {
        const kneeData = shotFrames
            .filter(f => f.trackers.knee)
            .map(f => ({
                y: f.trackers.knee.position.y,
                time: f.timestamp
            }));
        
        if (kneeData.length < 5) {
            console.log('Not enough knee data for analysis:', kneeData.length);
            return { takeoff: null, landing: null, maxDisplacement: 0, uShapeCount: 0 };
        }
        
        // Find local maxima (U-shapes) in knee Y position
        // NOTE: In MediaPipe, Y increases downward, so maximum Y = lowest point
        const uShapes = [];
        for (let i = 2; i < kneeData.length - 2; i++) {
            const current = kneeData[i];
            const neighbors = [
                kneeData[i-2].y,
                kneeData[i-1].y,
                kneeData[i+1].y,
                kneeData[i+2].y
            ];
            
            // Check if current is local maximum (lowest point)
            const isLocalMax = neighbors.every(neighborY => current.y >= neighborY);
            
            if (isLocalMax) {
                uShapes.push({
                    index: i,
                    y: current.y,
                    time: current.time
                });
            }
        }
        
        console.log(`Found ${uShapes.length} knee U-shapes in ${kneeData.length} frames`);
        
        // Determine release time if not provided
        if (!releaseTime) {
            // Estimate release time as 70% through the shot for backwards compatibility
            const startTime = shotFrames[0].timestamp;
            const endTime = shotFrames[shotFrames.length - 1].timestamp;
            releaseTime = startTime + (endTime - startTime) * 0.7;
        }
        
        // Separate pre-release and post-release U-shapes
        const preRelease = uShapes.filter(u => u.time < releaseTime);
        const postRelease = uShapes.filter(u => u.time >= releaseTime);
        
        // Select the closest U-shapes to release
        const takeoff = preRelease.length > 0 ? preRelease[preRelease.length - 1] : null;
        const landing = postRelease.length > 0 ? postRelease[0] : null;
        
        if (takeoff) {
            console.log(`Takeoff detected: Y=${takeoff.y.toFixed(3)}, ${((releaseTime - takeoff.time) / 1000).toFixed(2)}s before release`);
        }
        if (landing) {
            console.log(`Landing detected: Y=${landing.y.toFixed(3)}, ${((landing.time - releaseTime) / 1000).toFixed(2)}s after release`);
        }
        
        // Calculate max displacement
        const yValues = kneeData.map(k => k.y);
        const maxY = Math.max(...yValues);
        const minY = Math.min(...yValues);
        const maxDisplacement = maxY - minY;
        
        return {
            takeoff,
            landing,
            maxDisplacement,
            uShapeCount: uShapes.length
        };
    },

    // Analyze toe displacement
    analyzeToeDisplacement(shotFrames, releaseTime = null) {
        const toeData = shotFrames
            .filter(f => f.trackers.toe)
            .map(f => f.trackers.toe);
        
        if (toeData.length < 2) {
            console.log('Not enough toe data for analysis:', toeData.length);
            return { 
                normalizedDisplacement: 0, 
                rawDisplacement: 0,
                averageThighLength: 0,
                averageBodyLength: 0 
            };
        }
        
        // Get average thigh length for normalization
        const avgThighLength = toeData.reduce((sum, t) => 
            sum + t.thighLength, 0) / toeData.length;
        
        // Also get average upper body length for logging
        const avgBodyLength = toeData.reduce((sum, t) => 
            sum + t.upperBodyLength, 0) / toeData.length;
        
        console.log(`Average thigh length: ${avgThighLength.toFixed(3)}, upper body length: ${avgBodyLength.toFixed(3)}`);
        
        // Find knee U-shapes to measure displacement at those points
        const kneeAnalysis = this.analyzeKneeMovement(shotFrames, releaseTime);
        
        let displacement = 0;
        let method = 'unknown';
        
        if (kneeAnalysis.takeoff && kneeAnalysis.landing) {
            // Find toe positions at knee U-shape moments
            const takeoffFrame = shotFrames.find(f => 
                Math.abs(f.timestamp - kneeAnalysis.takeoff.time) < 50
            );
            const landingFrame = shotFrames.find(f => 
                Math.abs(f.timestamp - kneeAnalysis.landing.time) < 50
            );
            
            if (takeoffFrame?.trackers.toe && landingFrame?.trackers.toe) {
                const toe1 = takeoffFrame.trackers.toe.position;
                const toe2 = landingFrame.trackers.toe.position;
                displacement = Math.abs(toe1.x - toe2.x);
                method = 'knee-based';
                console.log(`Toe displacement (knee-based): X1=${toe1.x.toFixed(3)}, X2=${toe2.x.toFixed(3)}, displacement=${displacement.toFixed(3)}`);
            }
        } 
        
        if (displacement === 0) {
            // Fallback: measure max displacement across all frames
            const xPositions = toeData.map(t => t.position.x);
            const maxX = Math.max(...xPositions);
            const minX = Math.min(...xPositions);
            displacement = maxX - minX;
            method = 'max-min';
            console.log(`Toe displacement (max-min fallback): minX=${minX.toFixed(3)}, maxX=${maxX.toFixed(3)}, displacement=${displacement.toFixed(3)}`);
        }
        
        // Normalize by thigh length (like knee-detection.js)
        const normalizedDisplacement = avgThighLength > 0 ? 
            displacement / avgThighLength : 0;
        
        console.log(`Normalized displacement: ${(normalizedDisplacement * 100).toFixed(1)}% (method: ${method})`);
        
        return {
            normalizedDisplacement,
            rawDisplacement: displacement,
            averageThighLength: avgThighLength,
            averageBodyLength: avgBodyLength
        };
    },

    // Get stability level based on normalized toe displacement
    getStabilityLevel(normalizedDisplacement) {
        const percentage = normalizedDisplacement * 100;
        
        for (const [level, config] of Object.entries(STABILITY_LEVELS)) {
            if (percentage <= config.max * 100) {
                return {
                    level,
                    percentage: percentage.toFixed(1),
                    color: config.color,
                    label: config.label
                };
            }
        }
    },

    // Main analysis function for stability metrics
    async analyzeStability(shotFrames, releaseTime = null) {
        console.log('=== Starting Stability Analysis ===');
        console.log(`Analyzing ${shotFrames.length} frames`);
        
        // Debug: Check first few frames for tracker data
        if (shotFrames.length > 0) {
            console.log('First frame trackers:', Object.keys(shotFrames[0].trackers || {}));
            console.log('Sample knee data:', shotFrames[0].trackers?.knee);
            console.log('Sample toe data:', shotFrames[0].trackers?.toe);
        }
        
        // Pass release time to both analyses for proper timing
        const kneeData = this.analyzeKneeMovement(shotFrames, releaseTime);
        const toeData = this.analyzeToeDisplacement(shotFrames, releaseTime);
        const stabilityLevel = this.getStabilityLevel(toeData.normalizedDisplacement);
        
        // Calculate stability score: 100 - displacement percentage
        const stabilityScore = Math.max(0, 100 - parseFloat(stabilityLevel.percentage));
        
        console.log('=== Analysis Results ===');
        console.log('Knee data:', kneeData);
        console.log('Toe data:', toeData);
        console.log('Stability level:', stabilityLevel);
        console.log('Stability score:', stabilityScore);
        
        return {
            knee: {
                takeoff: kneeData.takeoff,
                landing: kneeData.landing,
                maxDisplacement: kneeData.maxDisplacement,
                uShapeCount: kneeData.uShapeCount
            },
            toe: {
                displacement: toeData.normalizedDisplacement,
                rawDisplacement: toeData.rawDisplacement,
                level: stabilityLevel.level,
                percentage: stabilityLevel.percentage,
                color: stabilityLevel.color,
                label: stabilityLevel.label,
                thighLength: toeData.averageThighLength
            },
            overall: {
                score: stabilityScore,
                feedback: this.generateFeedback(stabilityLevel.level)
            }
        };
    },


    // Generate feedback based on stability level
    generateFeedback(level) {
        const feedbacks = {
            perfect: "Excellent stability! Your form is very consistent.",
            great: "Great job! Minor improvements possible in foot placement.",
            ok: "Good effort! Focus on keeping your feet more stable.",
            bad: "Needs work. Try to minimize foot movement during shots.",
            veryBad: "Significant instability detected. Practice stationary shots first."
        };
        
        return feedbacks[level] || "Keep practicing!";
    }
};

// Export configuration for use in app-navigation.js
export { SHOT_DETECTION_CONFIG, STABILITY_LEVELS };