// PWA Camera Fix - Ensures camera works in PWA mode
// Updated: 2025-07-26 - Fix navigator.mediaDevices issues in PWA

(function() {
    // Polyfill for older browsers and PWA mode
    if (!navigator.mediaDevices) {
        navigator.mediaDevices = {};
    }

    // Add getUserMedia if it doesn't exist
    if (!navigator.mediaDevices.getUserMedia) {
        // Try to use legacy methods
        const getUserMedia = navigator.getUserMedia || 
                            navigator.webkitGetUserMedia || 
                            navigator.mozGetUserMedia || 
                            navigator.msGetUserMedia;

        if (getUserMedia) {
            // Wrap legacy method in Promise
            navigator.mediaDevices.getUserMedia = function(constraints) {
                return new Promise((resolve, reject) => {
                    getUserMedia.call(navigator, constraints, resolve, reject);
                });
            };
        } else {
            // No camera API available at all
            navigator.mediaDevices.getUserMedia = function() {
                return Promise.reject(new Error('getUserMedia is not supported in this browser'));
            };
        }
    }

    // Add enumerateDevices if it doesn't exist
    if (!navigator.mediaDevices.enumerateDevices) {
        navigator.mediaDevices.enumerateDevices = function() {
            return Promise.resolve([]);
        };
    }

    // Check if we're in PWA mode
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || 
                  window.navigator.standalone === true;

    // Log environment info for debugging
    console.log('PWA Camera Fix loaded:', {
        isPWA: isPWA,
        hasGetUserMedia: !!navigator.mediaDevices.getUserMedia,
        protocol: window.location.protocol,
        userAgent: navigator.userAgent
    });

    // Show warning if not HTTPS in PWA mode
    if (isPWA && window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
        console.warn('Camera access requires HTTPS in PWA mode. Current protocol:', window.location.protocol);
    }
})();