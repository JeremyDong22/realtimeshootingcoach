// PWA and Platform Detection Utilities
// Handles cross-platform PWA detection and provides platform-specific solutions

class PWAUtils {
    constructor() {
        this.isStandalone = this.detectStandaloneMode();
        this.platform = this.detectPlatform();
        this.browserInfo = this.detectBrowser();
    }

    // Detect if app is running in standalone PWA mode
    detectStandaloneMode() {
        // Check multiple methods for PWA detection
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                           window.navigator.standalone === true || // iOS Safari
                           document.referrer.includes('android-app://'); // Android TWA
        
        // Additional check for installed PWA
        const isInstalledPWA = window.matchMedia('(display-mode: standalone)').matches ||
                             window.matchMedia('(display-mode: fullscreen)').matches ||
                             window.matchMedia('(display-mode: minimal-ui)').matches;
        
        return isStandalone || isInstalledPWA;
    }

    // Detect platform (iOS, Android, Desktop)
    detectPlatform() {
        const userAgent = navigator.userAgent || navigator.vendor || window.opera;
        
        // iOS detection
        if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
            const version = this.getiOSVersion();
            return {
                type: 'iOS',
                version: version,
                isProblematic: this.isStandalone // iOS PWAs have camera issues
            };
        }
        
        // Android detection
        if (/android/i.test(userAgent)) {
            const version = this.getAndroidVersion();
            return {
                type: 'Android',
                version: version,
                isProblematic: version >= 11 && this.isStandalone // Android 11+ PWAs have freezing issues
            };
        }
        
        // Desktop
        return {
            type: 'Desktop',
            version: null,
            isProblematic: false
        };
    }

    // Detect browser type
    detectBrowser() {
        const userAgent = navigator.userAgent.toLowerCase();
        
        if (userAgent.includes('chrome') && !userAgent.includes('edg')) {
            return { name: 'Chrome', version: this.getBrowserVersion('Chrome') };
        } else if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
            return { name: 'Safari', version: this.getBrowserVersion('Safari') };
        } else if (userAgent.includes('firefox')) {
            return { name: 'Firefox', version: this.getBrowserVersion('Firefox') };
        } else if (userAgent.includes('samsung')) {
            return { name: 'Samsung Browser', version: this.getBrowserVersion('SamsungBrowser') };
        } else if (userAgent.includes('edg')) {
            return { name: 'Edge', version: this.getBrowserVersion('Edg') };
        }
        
        return { name: 'Unknown', version: null };
    }

    // Get iOS version
    getiOSVersion() {
        const match = navigator.userAgent.match(/OS (\d+)_(\d+)_?(\d+)?/);
        if (match) {
            return parseFloat(match[1] + '.' + match[2]);
        }
        return null;
    }

    // Get Android version
    getAndroidVersion() {
        const match = navigator.userAgent.match(/Android (\d+\.?\d*)/);
        if (match) {
            return parseFloat(match[1]);
        }
        return null;
    }

    // Get browser version
    getBrowserVersion(browserName) {
        const userAgent = navigator.userAgent;
        const regex = new RegExp(browserName + '/(\\d+\\.\\d+)');
        const match = userAgent.match(regex);
        return match ? parseFloat(match[1]) : null;
    }

    // Check if camera access is likely to work
    canAccessCamera() {
        // Check for secure context (HTTPS or localhost)
        const isSecureContext = window.isSecureContext;
        
        // Check if mediaDevices API is available
        const hasMediaDevices = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
        
        // Platform-specific checks
        let platformSupport = true;
        
        if (this.platform.type === 'iOS' && this.isStandalone) {
            // iOS PWAs have known issues with camera access
            platformSupport = false;
        } else if (this.platform.type === 'Android' && this.platform.version >= 11 && this.isStandalone) {
            // Android 11+ PWAs may have freezing issues but can still access camera
            platformSupport = 'partial'; // Camera works but may freeze
        }
        
        return {
            supported: isSecureContext && hasMediaDevices && platformSupport !== false,
            issues: {
                secureContext: !isSecureContext,
                mediaDevices: !hasMediaDevices,
                platformIssue: platformSupport === false,
                mayFreeze: platformSupport === 'partial'
            },
            recommendation: this.getCameraRecommendation()
        };
    }

    // Get platform-specific camera recommendations
    getCameraRecommendation() {
        if (this.platform.type === 'iOS' && this.isStandalone) {
            return {
                issue: 'iOS_PWA_CAMERA_BLOCKED',
                message: 'Camera access is blocked in iOS PWA. Please use Safari browser instead.',
                solution: 'OPEN_IN_BROWSER',
                instructions: [
                    'Tap the share button',
                    'Select "Open in Safari"',
                    'Use the camera in browser mode'
                ]
            };
        } else if (this.platform.type === 'Android' && this.platform.version >= 11 && this.isStandalone) {
            return {
                issue: 'ANDROID_PWA_FREEZE',
                message: 'Camera may freeze on Android. If it happens, minimize and restore the app.',
                solution: 'MINIMIZE_RESTORE',
                instructions: [
                    'If camera freezes, swipe up to minimize',
                    'Tap the app again to restore',
                    'Camera should resume working'
                ]
            };
        } else if (!window.isSecureContext) {
            return {
                issue: 'INSECURE_CONTEXT',
                message: 'HTTPS connection required for camera access.',
                solution: 'USE_HTTPS',
                instructions: [
                    'Deploy app to HTTPS server',
                    'Or use localhost for testing'
                ]
            };
        }
        
        return {
            issue: 'NONE',
            message: 'Camera should work normally',
            solution: 'STANDARD',
            instructions: []
        };
    }

    // Open current page in browser (for iOS PWA users)
    openInBrowser() {
        if (this.platform.type === 'iOS') {
            // iOS doesn't allow programmatic opening in Safari from PWA
            // Show instructions instead
            return {
                success: false,
                message: 'Please manually open in Safari using the share button'
            };
        } else if (this.platform.type === 'Android') {
            // Try to open in default browser
            window.open(window.location.href, '_blank');
            return {
                success: true,
                message: 'Opening in browser...'
            };
        }
        
        return {
            success: false,
            message: 'Already in browser mode'
        };
    }

    // Get diagnostic information
    getDiagnostics() {
        return {
            platform: this.platform,
            browser: this.browserInfo,
            isStandalone: this.isStandalone,
            canAccessCamera: this.canAccessCamera(),
            userAgent: navigator.userAgent,
            isSecureContext: window.isSecureContext,
            hasMediaDevices: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
            timestamp: new Date().toISOString()
        };
    }
}

// Export as singleton
const pwaUtils = new PWAUtils();
export { pwaUtils };