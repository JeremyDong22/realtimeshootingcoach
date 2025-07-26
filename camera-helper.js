// Camera Helper - Handles camera initialization with fallbacks for mobile compatibility
// Created to fix navigator.mediaDevices.getUserMedia not existing on some mobile browsers

class CameraHelper {
    constructor() {
        this.stream = null;
        this.videoElement = null;
        this.frameCallback = null;
        this.isProcessing = false;
    }

    // Initialize camera with fallback methods
    async initialize(videoElement, options = {}) {
        this.videoElement = videoElement;
        this.frameCallback = options.onFrame;
        
        const constraints = {
            video: {
                width: { ideal: options.width || 1280 },
                height: { ideal: options.height || 720 },
                facingMode: options.facingMode || 'environment'
            }
        };

        try {
            // Try modern method first
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            } else {
                // Fallback to legacy methods
                const getUserMedia = navigator.getUserMedia || 
                                   navigator.webkitGetUserMedia || 
                                   navigator.mozGetUserMedia || 
                                   navigator.msGetUserMedia;

                if (!getUserMedia) {
                    throw new Error('Camera API not supported in this browser');
                }

                // Use legacy method with promise wrapper
                this.stream = await new Promise((resolve, reject) => {
                    getUserMedia.call(navigator, constraints, resolve, reject);
                });
            }

            // Attach stream to video element
            this.videoElement.srcObject = this.stream;
            
            // Wait for video to be ready
            await new Promise((resolve) => {
                this.videoElement.onloadedmetadata = () => {
                    this.videoElement.play();
                    resolve();
                };
            });

            // Start frame processing if callback provided
            if (this.frameCallback) {
                this.startFrameProcessing();
            }

            return true;

        } catch (error) {
            console.error('Camera initialization failed:', error);
            
            // Provide user-friendly error messages
            let errorMessage = 'Unable to access camera';
            
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                errorMessage = 'Camera permission denied. Please allow camera access and reload.';
            } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
                errorMessage = 'No camera found on this device.';
            } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
                errorMessage = 'Camera is already in use by another application.';
            } else if (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError') {
                errorMessage = 'Camera does not support the requested resolution.';
            } else if (!navigator.mediaDevices && !navigator.getUserMedia) {
                errorMessage = 'Your browser does not support camera access. Please use Chrome, Safari, or Firefox.';
            }

            throw new Error(errorMessage);
        }
    }

    // Start processing video frames
    startFrameProcessing() {
        this.isProcessing = true;
        
        const processFrame = async () => {
            if (!this.isProcessing) return;
            
            if (this.frameCallback && this.videoElement.readyState === this.videoElement.HAVE_ENOUGH_DATA) {
                try {
                    await this.frameCallback();
                } catch (err) {
                    console.error('Frame processing error:', err);
                }
            }
            
            requestAnimationFrame(processFrame);
        };
        
        requestAnimationFrame(processFrame);
    }

    // Stop camera and clean up
    stop() {
        this.isProcessing = false;
        
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        
        if (this.videoElement) {
            this.videoElement.srcObject = null;
        }
    }

    // Check if camera is available
    static async isAvailable() {
        return !!(navigator.mediaDevices?.getUserMedia || 
                 navigator.getUserMedia || 
                 navigator.webkitGetUserMedia || 
                 navigator.mozGetUserMedia || 
                 navigator.msGetUserMedia);
    }

    // Get list of available cameras
    static async getCameras() {
        if (!navigator.mediaDevices?.enumerateDevices) {
            return [];
        }
        
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            return devices.filter(device => device.kind === 'videoinput');
        } catch (error) {
            console.error('Error enumerating devices:', error);
            return [];
        }
    }
}

// Export for use in other files
window.CameraHelper = CameraHelper;