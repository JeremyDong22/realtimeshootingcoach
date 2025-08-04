// Modern Shooting Coach App
// Recent changes:
// - Fixed replay video playback speed by using actual frame timestamps instead of fixed 30fps interval
// - Added frame rate logging to debug video generation performance
// - Added multi-language support with language switcher in Profile page
// - Changed video generation to normal speed (1.0x) and added playback speed control (0.25x-1.25x)
// - Added applyPreset function stub for professional mode (under development)
// - Fixed service worker cache paths to match actual file structure
// - Enhanced camera handling for cross-platform PWA compatibility
// - Added Android freeze recovery and iOS PWA detection
import { simpleAuth, simpleShots, getUserCount } from './simple-auth.js';
import { supabase } from './supabase-client.js';
import { t, setLanguage, getCurrentLanguage, updateUILanguage, speak, getSpeechCommand } from './i18n.js';
import { pwaUtils } from './pwa-utils.js';

// MediaPipe imports (from global scope)
const { Pose, Camera, drawConnectors, drawLandmarks, POSE_CONNECTIONS } = window;

// Initialize IndexedDB for video storage (shared with app.js)
let db;
const DB_NAME = 'ShootingCoachDB';
const DB_VERSION = 1;
const STORE_NAME = 'shotVideos';

async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                store.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };
    });
}

// Initialize DB when script loads
initDB().then(async () => {
    // Request persistent storage to prevent data loss
    if (navigator.storage && navigator.storage.persist) {
        const isPersisted = await navigator.storage.persist();
        // Persistent storage enabled: isPersisted
    }
}).catch(console.error);

// Helper functions for video management
async function getAllVideos() {
    if (!db) await initDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        
        request.onsuccess = () => {
            // Sort by timestamp, newest first
            const videos = request.result.sort((a, b) => b.timestamp - a.timestamp);
            resolve(videos);
        };
        request.onerror = () => reject(request.error);
    });
}

// Expose getAllVideos to window for use by simple-auth.js
window.getAllVideos = getAllVideos;

async function getVideo(id) {
    if (!db) {
        await initDB();
    }
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);
        
        request.onsuccess = () => {
            const result = request.result;
            resolve(result);
        };
        request.onerror = () => {
            console.error(' getVideo error:', request.error);
            reject(request.error);
        };
    });
}

async function deleteVideo(id) {
    if (!db) await initDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function clearAllVideos() {
    if (!db) await initDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// App State
const state = {
    currentPage: 'landing',
    user: null,
    isTraining: false,
    sessionShots: 0,
    sessionId: null, // Track current training session
    trainingStartTime: null,
    pose: null,
    camera: null,
    cameraFacingMode: 'user', // 'user' for front camera, 'environment' for back camera
    shotDetection: {
        isTracking: false,
        wristHistory: [],
        angleHistory: [],
        isAboveTrigger: false,
        shotStartTime: null
    },
    trainingSettings: {
        mode: null, // 'shots', 'time', 'free'
        targetShots: 10,
        targetTime: 60, // seconds
        timeRemaining: 0,
        timerInterval: null,
        targetReached: false // Flag to prevent duplicate completion messages
    },
    jointTracking: {
        lastSeenTime: {},
        requiredJoints: ['ankle', 'knee', 'hip', 'shoulder', 'elbow', 'wrist'],
        bodyNotDetectedTime: null,
        lastBodyWarning: null
    }
};

// Enhanced Camera Helper Class with cross-platform support
class CameraHelper {
    constructor() {
        this.stream = null;
        this.video = null;
        this.onFrameCallback = null;
        this.animationId = null;
        this.facingMode = 'user'; // 'user' or 'environment'
        this.initializationAttempts = 0;
        this.maxRetries = 3;
        this.androidFreezeTimeout = null;
        this.isRecovering = false;
    }
    
    async initialize(videoElement, options = {}) {
        this.video = videoElement;
        this.onFrameCallback = options.onFrame;
        this.facingMode = state.cameraFacingMode || 'user';
        this.initializationAttempts++;
        
        // Check platform compatibility first
        const cameraCheck = pwaUtils.canAccessCamera();
        if (!cameraCheck.supported && cameraCheck.issues.platformIssue) {
            // Handle platform-specific issues
            const recommendation = cameraCheck.recommendation;
            throw new Error(`PLATFORM_ISSUE:${recommendation.issue}`);
        }
        
        // Apply mirror effect for front camera
        if (this.facingMode === 'user') {
            this.video.classList.add('mirror');
            document.getElementById('canvas').classList.add('mirror');
        } else {
            this.video.classList.remove('mirror');
            document.getElementById('canvas').classList.remove('mirror');
        }
        
        const constraints = {
            video: {
                width: { ideal: options.width || 1280 },
                height: { ideal: options.height || 720 },
                facingMode: this.facingMode
            },
            audio: false
        };
        
        try {
            // Add timeout for camera initialization
            const initTimeout = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('CAMERA_INIT_TIMEOUT')), 10000);
            });
            
            // Race between getUserMedia and timeout
            this.stream = await Promise.race([
                navigator.mediaDevices.getUserMedia(constraints),
                initTimeout
            ]);
            
            this.video.srcObject = this.stream;
            
            // Setup Android freeze detection
            if (pwaUtils.platform.type === 'Android' && pwaUtils.isStandalone) {
                this.setupAndroidFreezeDetection();
            }
            
            // Start frame processing
            if (this.onFrameCallback) {
                const processFrame = () => {
                    if (this.stream && this.onFrameCallback) {
                        this.onFrameCallback();
                        this.animationId = requestAnimationFrame(processFrame);
                    }
                };
                // Wait for video to be ready
                this.video.addEventListener('loadedmetadata', () => {
                    processFrame();
                    // Reset attempts on successful initialization
                    this.initializationAttempts = 0;
                });
            }
            
            return this.stream;
        } catch (error) {
            console.error('Camera initialization error:', error);
            
            // Handle different error types
            if (error.message === 'CAMERA_INIT_TIMEOUT') {
                // Timeout - likely Android freeze
                if (pwaUtils.platform.type === 'Android' && this.initializationAttempts < this.maxRetries) {
                    return this.recoverFromAndroidFreeze();
                }
            }
            
            // Check if it's a permission error
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                throw new Error('PERMISSION_DENIED');
            }
            
            // Check if it's a secure context error
            if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
                throw new Error('CAMERA_NOT_FOUND');
            }
            
            throw error;
        }
    }
    
    // Android freeze detection and recovery
    setupAndroidFreezeDetection() {
        let lastFrameTime = Date.now();
        const checkInterval = 2000; // Check every 2 seconds
        
        this.androidFreezeTimeout = setInterval(() => {
            const currentTime = Date.now();
            if (currentTime - lastFrameTime > 5000 && !this.isRecovering) {
                // No frames for 5 seconds - likely frozen
                console.warn('Android camera freeze detected, attempting recovery...');
                this.recoverFromAndroidFreeze();
            }
        }, checkInterval);
        
        // Update frame time on each frame
        const originalCallback = this.onFrameCallback;
        this.onFrameCallback = () => {
            lastFrameTime = Date.now();
            if (originalCallback) originalCallback();
        };
    }
    
    async recoverFromAndroidFreeze() {
        if (this.isRecovering) return;
        this.isRecovering = true;
        
        try {
            // Stop current stream
            this.stop();
            
            // Wait a moment
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Try to reinitialize
            await this.initialize(this.video, {
                width: 1280,
                height: 720,
                onFrame: this.onFrameCallback
            });
            
            console.log('Camera recovered from freeze');
            
            // Show recovery message to user
            const statusEl = document.getElementById('trainingStatus');
            if (statusEl) {
                statusEl.textContent = getCurrentLanguage() === 'zh' ? 
                    '摄像头已恢复' : 'Camera recovered';
            }
        } catch (err) {
            console.error('Failed to recover from freeze:', err);
            // If recovery fails, suggest manual recovery
            const statusEl = document.getElementById('trainingStatus');
            if (statusEl) {
                statusEl.textContent = getCurrentLanguage() === 'zh' ? 
                    '请最小化并恢复应用以修复摄像头' : 
                    'Please minimize and restore app to fix camera';
            }
        } finally {
            this.isRecovering = false;
        }
    }
    
    async switchCamera() {
        // Toggle facing mode
        this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
        state.cameraFacingMode = this.facingMode;
        
        // Stop current stream
        this.stop();
        
        // Reinitialize with new camera
        await this.initialize(this.video, {
            width: 1280,
            height: 720,
            onFrame: this.onFrameCallback
        });
    }
    
    stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        if (this.androidFreezeTimeout) {
            clearInterval(this.androidFreezeTimeout);
            this.androidFreezeTimeout = null;
        }
        
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        
        if (this.video) {
            this.video.srcObject = null;
        }
    }
    
    start() {
        // For compatibility with MediaPipe Camera interface
        return this.initialize(this.video, {
            width: 1280,
            height: 720,
            onFrame: this.onFrameCallback
        });
    }
}

// Audio Management
class AudioManager {
    constructor() {
        this.synth = window.speechSynthesis;
        this.audioContext = null;
    }
    
    speak(text, rate = 1.0) {
        if (!this.synth) return;
        
        // Cancel any ongoing speech
        this.synth.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = getCurrentLanguage() === 'zh' ? 'zh-CN' : 'en-US';
        utterance.rate = rate;
        utterance.volume = 0.5;
        utterance.pitch = 1.0;
        
        this.synth.speak(utterance);
    }
    
    playBeep(frequency = 800, duration = 100) {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration / 1000);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + duration / 1000);
    }
    
    playShotSound() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        const now = this.audioContext.currentTime;
        
        // Create two oscillators for a richer sound
        const osc1 = this.audioContext.createOscillator();
        const osc2 = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        // Connect oscillators
        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        // Set frequencies for a pleasant "swoosh" sound
        osc1.frequency.setValueAtTime(600, now);
        osc1.frequency.exponentialRampToValueAtTime(300, now + 0.1);
        
        osc2.frequency.setValueAtTime(800, now);
        osc2.frequency.exponentialRampToValueAtTime(400, now + 0.1);
        
        // Set gain envelope
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.3, now + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        
        // Start and stop oscillators
        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.1);
        osc2.stop(now + 0.1);
    }
}

const audioManager = new AudioManager();

// Change language function
function changeLanguage(lang) {
    setLanguage(lang);
    
    // Update active button
    document.querySelectorAll('.language-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    if (lang === 'zh') {
        document.getElementById('langZh')?.classList.add('active');
    } else {
        document.getElementById('langEn')?.classList.add('active');
    }
    
    // Update all UI elements
    updateUILanguage();
}

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
    // Set up dynamic viewport height
    updateViewportHeight();
    window.addEventListener('resize', updateViewportHeight);
    window.addEventListener('orientationchange', updateViewportHeight);
    
    // Initialize landing page with login mode by default
    const landingPage = document.getElementById('landing');
    if (landingPage) {
        landingPage.classList.add('login-mode');
    }
    
    // Initialize language
    const savedLang = getCurrentLanguage();
    if (savedLang === 'en') {
        document.getElementById('langZh')?.classList.remove('active');
        document.getElementById('langEn')?.classList.add('active');
    }
    // Wait for DOM to be fully loaded before updating UI language
    setTimeout(() => {
        updateUILanguage();
    }, 100);
    
    // Check if user is already logged in using session storage
    const user = await simpleAuth.getUser();
    if (user) {
        state.user = user;
        // Navigate to home or last page if stored
        const lastPage = sessionStorage.getItem('shootingCoachLastPage') || 'home';
        if (lastPage !== 'landing') {
            navigateTo(lastPage);
            if (lastPage === 'home') {
                loadStats(); // Load stats when navigating to home
            }
        }
    } else {
        // No authenticated user, show landing page
        state.user = null;
        navigateTo('landing');
    }
    
    // Update user count
    await updateUserCount();
    
    // Setup event listeners
    setupEventListeners();
});

// Handle dynamic viewport height for mobile browsers
function updateViewportHeight() {
    // First we get the viewport height and multiply it by 1% to get a value for a vh unit
    const vh = window.innerHeight * 0.01;
    // Then we set the value in the --vh custom property to the root of the document
    document.documentElement.style.setProperty('--vh', `${vh}px`);
    
    // Also update full height
    document.documentElement.style.setProperty('--full-height', `${window.innerHeight}px`);
}

// Password Validation
function validatePassword(password) {
    if (password.length < 8) {
        return 'Password must be at least 8 characters long';
    }
    
    if (!/[A-Z]/.test(password)) {
        return 'Password must include at least one uppercase letter';
    }
    
    if (!/[a-z]/.test(password)) {
        return 'Password must include at least one lowercase letter';
    }
    
    if (!/[0-9]/.test(password)) {
        return 'Password must include at least one number';
    }
    
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
        return 'Password must include at least one special character';
    }
    
    return null; // No error
}

// Event Listeners
function setupEventListeners() {
    // Global click handler for dynamic shot cards
    document.addEventListener('click', function(e) {
        // Handle local shot card clicks (in replay sessions)
        const localShotCard = e.target.closest('.shot-card');
        if (localShotCard && !e.target.closest('.shot-action-btn')) {
            e.preventDefault();
            const shotId = localShotCard.dataset.shotId;
            if (shotId) {
                playLocalReplay(parseInt(shotId));
                return;
            }
        }
        
        // Handle session shot card clicks
        const shotCard = e.target.closest('.session-shot-card');
        if (shotCard && !e.target.closest('.replay-delete-btn') && !e.target.closest('.shot-action-btn')) {
            e.preventDefault();
            const shotId = shotCard.dataset.shotId;
            if (shotId) {
                playReplay(shotId);
            }
        }
        
        // Handle shot thumbnail clicks
        const shotThumbnail = e.target.closest('.session-shot-thumbnail');
        if (shotThumbnail && !e.target.closest('video')) {
            e.preventDefault();
            const parentCard = shotThumbnail.closest('.session-shot-card');
            if (parentCard) {
                const shotId = parentCard.dataset.shotId;
                if (shotId) {
                    playReplay(shotId);
                }
            }
        }
        
        // Handle replay card clicks (on main replays page)
        const replayCard = e.target.closest('.replay-card');
        if (replayCard) {
            const onclick = replayCard.getAttribute('onclick');
        }
    });
    
    // Auth toggle
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            const mode = e.target.dataset.mode;
            const nameGroup = document.getElementById('nameGroup');
            const handGroup = document.getElementById('handGroup');
            const submitBtn = document.getElementById('authSubmit');
            const landingPage = document.getElementById('landing');
            
            if (mode === 'signup') {
                nameGroup.style.display = 'block';
                handGroup.style.display = 'block';
                submitBtn.querySelector('.btn-text').textContent = t('signup');
                // Add signup mode class for scrolling
                landingPage.classList.remove('login-mode');
                landingPage.classList.add('signup-mode');
            } else {
                nameGroup.style.display = 'none';
                handGroup.style.display = 'none';
                submitBtn.querySelector('.btn-text').textContent = t('login');
                // Add login mode class to prevent scrolling
                landingPage.classList.remove('signup-mode');
                landingPage.classList.add('login-mode');
            }
        });
    });
    
    // Auth form
    document.getElementById('authForm').addEventListener('submit', handleAuth);
    
    // Password input validation
    const passwordInput = document.getElementById('password');
    const passwordRequirements = document.getElementById('passwordRequirements');
    
    passwordInput.addEventListener('focus', () => {
        const mode = document.querySelector('.toggle-btn.active').dataset.mode;
        if (mode === 'signup') {
            passwordRequirements.style.display = 'block';
        }
    });
    
    passwordInput.addEventListener('blur', () => {
        if (!passwordInput.value) {
            passwordRequirements.style.display = 'none';
        }
    });
    
    passwordInput.addEventListener('input', () => {
        const mode = document.querySelector('.toggle-btn.active').dataset.mode;
        if (mode === 'signup') {
            const password = passwordInput.value;
            
            // Check each requirement
            document.getElementById('req-length').classList.toggle('valid', password.length >= 8);
            document.getElementById('req-uppercase').classList.toggle('valid', /[A-Z]/.test(password));
            document.getElementById('req-lowercase').classList.toggle('valid', /[a-z]/.test(password));
            document.getElementById('req-number').classList.toggle('valid', /[0-9]/.test(password));
            document.getElementById('req-special').classList.toggle('valid', /[!@#$%^&*(),.?\":{}|<>]/.test(password));
        }
    });
    
    // Hand selection
    document.querySelectorAll('.hand-option').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.hand-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const hand = btn.dataset.hand;
            document.getElementById('shootingHand').value = hand;
        });
    });
    
    // Set default hand selection
    document.querySelector('.hand-option[data-hand="right"]')?.classList.add('active');
}

// Update user count
async function updateUserCount() {
    const count = await getUserCount();
    const userCountEl = document.getElementById('userCount');
    if (userCountEl) {
        userCountEl.textContent = `${count}/1000 users`;
    }
}

// Navigation
function navigateTo(page) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    
    // Show selected page
    const pageEl = document.getElementById(page);
    if (pageEl) {
        pageEl.classList.add('active');
        state.currentPage = page;
        
        // Save current page to session storage (except for landing)
        if (page !== 'landing' && state.user) {
            sessionStorage.setItem('shootingCoachLastPage', page);
        }
        
        // Update navbar - show for all pages except landing
        if (page !== 'landing') {
            document.getElementById('navbar').style.display = 'flex';
            
            // Update active nav item
            document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
            
            // Update shooting instructions when on training page
            if (page === 'training') {
                updateShootingInstructions();
            }
            if (page === 'home') {
                document.querySelector('.nav-item[onclick*="home"]')?.classList.add('active');
            } else if (page === 'trainingSetup' || page === 'trainingInstructions' || page === 'training') {
                // Keep Train button active for training-related pages
                document.querySelector('.nav-item[onclick*="trainingSetup"]')?.classList.add('active');
            } else if (page === 'replays') {
                document.querySelector('.nav-item[onclick*="replays"]')?.classList.add('active');
            }
        } else {
            document.getElementById('navbar').style.display = 'none';
        }
        
        // Page-specific actions
        if (page === 'replays') {
            loadSessions();
        } else if (page === 'home') {
            loadStats();
            loadRecentShots();
        }
    }
}

// Auth Handler
async function handleAuth(e) {
    e.preventDefault();
    
    const mode = document.querySelector('.toggle-btn.active').dataset.mode;
    const emailOrPhone = document.getElementById('emailOrPhone').value;
    const password = document.getElementById('password').value;
    const name = document.getElementById('name').value;
    const shootingHand = document.getElementById('shootingHand').value;
    
    // Validate inputs
    if (!emailOrPhone || !password) {
        alert(getCurrentLanguage() === 'zh' ? '请输入邮箱/手机号和密码' : 'Please enter both email/phone and password');
        return;
    }
    
    // Validate password requirements for signup
    if (mode === 'signup') {
        const passwordError = validatePassword(password);
        if (passwordError) {
            alert(passwordError);
            return;
        }
    }
    
    // Show loading
    const submitBtn = document.getElementById('authSubmit');
    submitBtn.disabled = true;
    submitBtn.querySelector('.btn-text').style.display = 'none';
    submitBtn.querySelector('.btn-loader').style.display = 'block';
    
    try {
        let result;
        
        if (mode === 'signup') {
            // Check user limit
            const count = await getUserCount();
            if (count >= 1000) {
                alert(getCurrentLanguage() === 'zh' ? '抱歉，我们已达到1000人的用户上限。请稍后再试。' : 'Sorry, we have reached our 1000 user limit. Please try again later.');
                return;
            }
            
            result = await simpleAuth.signUp(emailOrPhone, password, name || 'User', shootingHand);
        } else {
            result = await simpleAuth.signIn(emailOrPhone, password);
        }
        
        if (result.error) {
            // Show the error message from auth service
            alert(result.error);
        } else if (!result.data) {
            // No user data returned - authentication failed
            alert(getCurrentLanguage() === 'zh' ? '登录失败，请检查邮箱/手机号和密码' : 'Login failed, please check your email/phone and password');
        } else {
            state.user = result.data;
            // User is saved in Supabase, no need for localStorage
            
            if (mode === 'signup') {
                alert(getCurrentLanguage() === 'zh' ? `欢迎 ${name}！您是第${result.data.id}/1000位用户` : `Welcome ${name}! You are user #${result.data.id}/1000`);
            }
            await showHome();
        }
    } catch (err) {
        console.error('Auth error:', err);
        alert(getCurrentLanguage() === 'zh' ? '认证失败。请重试。' : 'Authentication failed. Please try again.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.querySelector('.btn-text').style.display = 'block';
        submitBtn.querySelector('.btn-loader').style.display = 'none';
    }
}

// Show Home
async function showHome() {
    navigateTo('home');
    await loadStats();
    await loadRecentShots();
}

// Get current week's Monday
function getWeekStart() {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Get Monday
    const monday = new Date(now.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
}

// Load Stats
async function loadStats() {
    if (!state.user) {
        return;
    }
    
    try {
        const { data: stats, error } = await simpleShots.getStats();
        
        // Get current week shots from IndexedDB
        const weekStart = getWeekStart();
        const { data: allShots } = await simpleShots.getShots();
        
        // Filter shots for current week
        const currentWeekShots = allShots ? allShots.filter(shot => {
            const shotDate = new Date(shot.timestamp || shot.created_at);
            return shotDate >= weekStart;
        }).length : 0;
        
        if (stats) {
            document.getElementById('totalShots').textContent = stats.total_shots || 0;
            
            // Average Shooting Speed (duration in seconds, convert to display format)
            const avgDuration = stats.avg_duration || 0;
            if (avgDuration > 0) {
                // If duration is in seconds, convert to milliseconds for display
                const avgShootingSpeedMs = avgDuration * 1000;
                if (avgShootingSpeedMs < 1000) {
                    document.getElementById('avgShootingSpeed').textContent = Math.round(avgShootingSpeedMs) + 'ms';
                } else {
                    document.getElementById('avgShootingSpeed').textContent = avgDuration.toFixed(1) + 's';
                }
            } else {
                document.getElementById('avgShootingSpeed').textContent = '0ms';
            }
        } else {
            // No stats yet, show defaults
            document.getElementById('totalShots').textContent = '0';
            document.getElementById('avgShootingSpeed').textContent = '0s';
            document.getElementById('shootingAccuracy').textContent = '0%';
            document.getElementById('avgShotsPerWeek').textContent = '0';
            document.getElementById('currentStreak').textContent = '0';
        }
            
        // Continue with original stats display if exists
        if (stats) {
            // Shooting Accuracy (placeholder - would need make/miss tracking)
            const accuracy = stats.total_shots > 0 ? Math.round(stats.total_shots * 0.65) : 0;
            document.getElementById('shootingAccuracy').textContent = accuracy + '%';
            
            // Shots this week (Monday to Sunday)
            document.getElementById('avgShotsPerWeek').textContent = currentWeekShots;
            
            // Calculate streak (placeholder)
            document.getElementById('currentStreak').textContent = Math.min(stats.total_shots, 5);
        }
    } catch (err) {
        console.error('Error loading stats:', err);
    }
}

// Load Recent Shots
async function loadRecentShots() {
    if (!state.user) return;
    
    const recentShotsEl = document.getElementById('recentShots');
    
    try {
        const { data: shots } = await simpleShots.getShots(5);
        
        if (shots && shots.length > 0) {
            // First, create the HTML
            recentShotsEl.innerHTML = shots.map((shot, index) => {
                // Extract shot data
                const shotData = shot.shotData || {};
                const duration = shotData.duration || shot.duration || 0;
                const velocity = shotData.velocity || 0;
                const timestamp = shot.timestamp || Date.now();
                
                return `
                    <div class="replay-card" onclick="playReplay(${shot.id})">
                        <div class="replay-thumbnail" id="shot-thumb-${shot.id}">
                            <div class="replay-badges">
                                <div class="badge">
                                    <svg viewBox="0 0 24 24" fill="currentColor" class="badge-icon">
                                        <path d="M13 2L3 14h8l-2 8 10-12h-8l2-8z"/>
                                    </svg>
                                    ${Math.round(velocity)}°/s
                                </div>
                                <div class="badge">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="badge-icon">
                                        <circle cx="12" cy="12" r="10"/>
                                        <polyline points="12 6 12 12 16 14"/>
                                    </svg>
                                    ${duration.toFixed(1)}s
                                </div>
                            </div>
                            <div class="replay-play">
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M8 5v14l11-7z"/>
                                </svg>
                            </div>
                        </div>
                        <div class="replay-info">
                            <div class="replay-title">Shot ${index + 1}</div>
                            <div class="replay-meta">${new Date(timestamp).toLocaleDateString()}</div>
                        </div>
                    </div>
                `;
            }).join('');
            
            // Then, load video thumbnails asynchronously
            shots.forEach(async (shot) => {
                try {
                    const videoData = await getVideo(shot.id);
                    if (videoData && videoData.videoBlob) {
                        const thumbEl = document.getElementById(`shot-thumb-${shot.id}`);
                        if (thumbEl) {
                            const videoUrl = URL.createObjectURL(videoData.videoBlob);
                            const video = document.createElement('video');
                            video.src = videoUrl;
                            video.muted = true;
                            video.style.width = '100%';
                            video.style.height = '100%';
                            video.style.objectFit = 'cover';
                            video.onloadedmetadata = () => {
                                video.currentTime = 0.1; // Show first frame
                            };
                            // Insert video before play overlay
                            thumbEl.insertBefore(video, thumbEl.firstChild);
                        }
                    }
                } catch (err) {
                    console.error('Error loading thumbnail for shot', shot.id, err);
                }
            });
        } else {
            recentShotsEl.innerHTML = `<div class="empty-state"><p>${t('noShotsYet')}</p></div>`;
        }
    } catch (err) {
        console.error('Error loading recent shots:', err);
    }
}

// Start Training
async function startTraining() {
    if (!state.user) {
        alert(getCurrentLanguage() === 'zh' ? '请先登录再开始训练' : 'Please log in to start training');
        return;
    }
    
    navigateTo('training');
    state.isTraining = true;
    state.sessionShots = 0;
    state.sessionId = `session-${Date.now()}`; // Create unique session ID
    state.trainingStartTime = Date.now();
    state.trainingSettings.targetReached = false; // Reset target reached flag
    
    // Update UI based on training mode
    document.getElementById('sessionShots').textContent = '0';
    
    if (state.trainingSettings.mode === 'shots') {
        document.getElementById('trainingStatus').textContent = `Target: ${state.trainingSettings.targetShots} shots`;
    } else if (state.trainingSettings.mode === 'time') {
        document.getElementById('trainingStatus').textContent = 'Initializing camera...';
    } else {
        document.getElementById('trainingStatus').textContent = 'Free Practice Mode';
    }
    
    // Start timer
    startTrainingTimer();
    
    // Initialize MediaPipe
    await initializeMediaPipe();
}

// Training Timer
function startTrainingTimer() {
    const timerEl = document.getElementById('trainingTimer');
    
    if (state.trainingSettings.mode === 'time') {
        // Countdown timer for time mode
        state.trainingSettings.timerInterval = setInterval(() => {
            if (!state.isTraining || state.trainingSettings.timeRemaining <= 0) {
                clearInterval(state.trainingSettings.timerInterval);
                if (state.trainingSettings.timeRemaining <= 0 && !state.trainingSettings.targetReached) {
                    // Time's up!
                    state.trainingSettings.targetReached = true;
                    document.getElementById('trainingStatus').textContent = "Time's up! Great job!";
                    setTimeout(() => stopTraining(), 2000);
                }
                return;
            }
            
            state.trainingSettings.timeRemaining--;
            const minutes = Math.floor(state.trainingSettings.timeRemaining / 60);
            const seconds = state.trainingSettings.timeRemaining % 60;
            timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            // Update status for last 10 seconds
            if (state.trainingSettings.timeRemaining <= 10 && state.trainingSettings.timeRemaining > 0) {
                document.getElementById('trainingStatus').textContent = `${state.trainingSettings.timeRemaining} seconds left!`;
            }
        }, 1000);
    } else {
        // Count up timer for shots mode and free mode
        const updateTimer = () => {
            if (!state.isTraining) return;
            
            const elapsed = Math.floor((Date.now() - state.trainingStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            requestAnimationFrame(updateTimer);
        };
        
        updateTimer();
    }
}

// Initialize MediaPipe
async function initializeMediaPipe() {
    try {
        // Initializing MediaPipe...
        
        if (!window.Pose) {
            console.error(' Pose not available in window!');
            document.getElementById('trainingStatus').textContent = 'Error: MediaPipe not loaded';
            return;
        }
        
        // Initialize Pose
        state.pose = new Pose({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
        });
        
        state.pose.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
            enableSegmentation: false,  // Disable segmentation for better performance
            smoothSegmentation: false
        });
        
        state.pose.onResults(onPoseResults);
        
        // Initialize the pose model with performance optimization
        // Show loading indicator
        document.getElementById('trainingStatus').textContent = getCurrentLanguage() === 'zh' ? 
            '正在初始化姿势检测...' : 'Initializing pose detection...';
        
        // Initialize pose asynchronously to avoid blocking
        await state.pose.initialize();
        
        // Initialize Camera
        const videoElement = document.getElementById('video');
        
        // Initialize tracking state
        state.shotDetection = {
            isTracking: false,
            wristHistory: [],
            angleHistory: [],
            isAboveTrigger: false,
            shotStartTime: null,
            isCountdownComplete: false,
            requiredJoints: {
                ankle: false,
                knee: false,
                hip: false,
                shoulder: false,
                elbow: false,
                wrist: false
            }
        };
        state.countdownStarted = false;
        state.visibilityStartTime = null;
        state.requiredVisibilityDuration = 500; // 500ms visibility requirement
        
        // Use CameraHelper for camera management (supports camera switching)
        try {
            state.cameraHelper = new CameraHelper();
            
            // Frame rate throttling for better performance
            let lastFrameTime = 0;
            const frameInterval = 1000 / 30; // Limit to 30fps for pose detection
            
            await state.cameraHelper.initialize(videoElement, {
                width: 1280,
                height: 720,
                onFrame: async () => {
                    const currentTime = performance.now();
                    if (currentTime - lastFrameTime < frameInterval) {
                        return; // Skip frame to maintain target fps
                    }
                    lastFrameTime = currentTime;
                    
                    if (state.pose && state.isTraining) {
                        try {
                            await state.pose.send({image: videoElement});
                        } catch (err) {
                            console.error('Error sending frame to pose:', err);
                        }
                    }
                }
            });
            
            // Setup camera flip button
            const flipBtn = document.getElementById('cameraFlipBtn');
            if (flipBtn) {
                flipBtn.style.display = 'flex';
                flipBtn.onclick = async () => {
                    try {
                        await state.cameraHelper.switchCamera();
                    } catch (err) {
                        console.error('Error switching camera:', err);
                    }
                };
            }
            
            // Setup double-tap gesture for camera switching with passive listener
            let lastTapTime = 0;
            videoElement.addEventListener('touchstart', (e) => {
                const currentTime = new Date().getTime();
                const tapLength = currentTime - lastTapTime;
                if (tapLength < 500 && tapLength > 0) {
                    // Double tap detected
                    if (state.cameraHelper) {
                        state.cameraHelper.switchCamera().catch(console.error);
                    }
                }
                lastTapTime = currentTime;
            }, { passive: true }); // Make listener passive for better scrolling performance
            
        } catch (cameraError) {
            console.error('Camera initialization failed:', cameraError);
            
            // Get platform-specific recommendations
            const cameraCheck = pwaUtils.canAccessCamera();
            const recommendation = cameraCheck.recommendation;
            
            // Handle platform-specific issues
            if (cameraError.message && cameraError.message.includes('PLATFORM_ISSUE:')) {
                const issue = cameraError.message.split(':')[1];
                
                if (issue === 'iOS_PWA_CAMERA_BLOCKED') {
                    // iOS PWA camera blocked
                    document.getElementById('trainingStatus').textContent = getCurrentLanguage() === 'zh' ? 
                        'iOS应用模式无法访问摄像头' : 'Camera blocked in iOS app mode';
                    
                    // Show detailed instructions with button to open in browser
                    const message = getCurrentLanguage() === 'zh' ? 
                        'iOS限制：安装的应用无法使用摄像头\n\n解决方法：\n1. 点击分享按钮\n2. 选择"在Safari中打开"\n3. 在浏览器中使用摄像头功能' :
                        'iOS Limitation: Installed apps cannot access camera\n\nSolution:\n1. Tap the share button\n2. Select "Open in Safari"\n3. Use camera in browser mode';
                    
                    alert(message);
                    
                    // Add button to help users
                    showCameraAlternatives('ios_pwa');
                    return;
                } else if (issue === 'ANDROID_PWA_FREEZE') {
                    // Android PWA may freeze - provide guidance
                    document.getElementById('trainingStatus').textContent = getCurrentLanguage() === 'zh' ? 
                        '提示：如摄像头冻结，请最小化并恢复应用' : 'Tip: If camera freezes, minimize and restore app';
                }
            }
            
            // Check for other common errors
            if (cameraError.message === 'PERMISSION_DENIED') {
                document.getElementById('trainingStatus').textContent = getCurrentLanguage() === 'zh' ? 
                    '摄像头权限被拒绝' : 'Camera permission denied';
                showCameraPermissionGuide();
                return;
            }
            
            if (cameraError.message === 'CAMERA_NOT_FOUND') {
                document.getElementById('trainingStatus').textContent = getCurrentLanguage() === 'zh' ? 
                    '未找到摄像头设备' : 'No camera device found';
                return;
            }
            
            // Check if we're in PWA mode without HTTPS
            if (!window.isSecureContext) {
                document.getElementById('trainingStatus').textContent = getCurrentLanguage() === 'zh' ? 
                    '需要HTTPS连接才能访问摄像头' : 'HTTPS required for camera access';
                alert(getCurrentLanguage() === 'zh' ? 
                    '投篮教练需要通过HTTPS安全连接访问摄像头。\n\n请将应用部署到支持HTTPS的服务器（如Vercel、Netlify等）。' : 
                    'Shooting Coach requires HTTPS to access camera.\n\nPlease deploy the app to an HTTPS-enabled server (like Vercel, Netlify, etc.).');
                setTimeout(() => navigateTo('home'), 2000);
                return;
            }
            
            throw cameraError;
        }
        
        // Show countdown overlay
        const countdownOverlay = document.getElementById('countdownOverlay');
        countdownOverlay.classList.remove('hidden');
        document.querySelectorAll('.joint-indicator').forEach(indicator => {
            indicator.style.display = 'flex';
        });
        document.getElementById('countdownNumber').style.display = 'none';
        
        // Start joint detection phase
        const isLeftHanded = state.shootingHand === 'left';
        const positionMessage = getCurrentLanguage() === 'zh' ? 
            (isLeftHanded ? '请将您的头部左侧面向摄像头' : '请将您的头部右侧面向摄像头') : 
            (isLeftHanded ? 'Position your left side to the camera' : 'Position your right side to the camera');
        
        document.getElementById('trainingStatus').textContent = positionMessage;
        
        // Speak the positioning instruction
        audioManager.speak(positionMessage);
        
    } catch (err) {
        console.error('MediaPipe initialization error:', err);
        
        // Provide better error messages based on the error
        let errorMessage = getCurrentLanguage() === 'zh' ? 
            '摄像头错误。请检查权限。' : 
            'Camera error. Please check permissions.';
            
        if (err.message && err.message.includes('browser does not support')) {
            errorMessage = getCurrentLanguage() === 'zh' ? 
                '您的浏览器不支持摄像头访问。请使用Chrome或Safari浏览器。' : 
                'Your browser does not support camera access. Please use Chrome or Safari.';
        } else if (err.message && err.message.includes('permission')) {
            errorMessage = getCurrentLanguage() === 'zh' ? 
                '摄像头权限被拒绝。请在设置中允许摄像头访问。' : 
                'Camera permission denied. Please allow camera access in settings.';
        }
        
        document.getElementById('trainingStatus').textContent = errorMessage;
        alert(errorMessage);
        
        // Navigate back to home after 3 seconds
        setTimeout(() => {
            navigateTo('home');
        }, 3000);
    }
}

// Start Recording - Updated to not use continuous MediaRecorder
function startRecording() {
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    
    // Set canvas size
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    
    // No longer need continuous MediaRecorder
    // Just ensure frameBuffer is ready (it's already initialized globally)
    console.log('Recording preparation complete - using frameBuffer for video generation');
    
    // Start debug panel updates
    startDebugPanel();
}

// Update debug panel
function startDebugPanel() {
    let frameCount = 0;
    let lastTime = Date.now();
    
    const updateDebug = () => {
        if (!state.isTraining) return;
        
        // Calculate FPS
        frameCount++;
        const now = Date.now();
        if (now - lastTime >= 1000) {
            // Debug FPS removed for performance
            frameCount = 0;
            lastTime = now;
        }
        
        // Shot detection info is updated directly in detectShot function
        
        requestAnimationFrame(updateDebug);
    };
    
    updateDebug();
}

// Pose Results Handler
let poseFrameCount = 0;
let lastProcessTime = 0;
const PROCESS_INTERVAL = 50; // Process every 50ms (20 FPS) for better performance

function onPoseResults(results) {
    try {
        // Throttle processing to improve performance
        const now = Date.now();
        if (now - lastProcessTime < PROCESS_INTERVAL) {
            return;
        }
        lastProcessTime = now;
        
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const video = document.getElementById('video');
        
        // Set canvas size only once
        if (!state.canvasSizeSet && video.videoWidth) {
            canvas.width = video.videoWidth || 1280;
            canvas.height = video.videoHeight || 720;
            state.canvasSizeSet = true;
        }
    
    // Simple logging only
    poseFrameCount++;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw video frame
    try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    } catch (err) {
        console.error(' Error drawing video to canvas:', err);
    }
    
    if (results.poseLandmarks) {
        // Always draw wrist for smooth visual tracking
        const isLeftHanded = state.shootingHand === 'left';
        const wristIndex = isLeftHanded ? 15 : 16;  // Left wrist: 15, Right wrist: 16
        
        if (results.poseLandmarks[wristIndex]) {
            const wrist = results.poseLandmarks[wristIndex];
            const x = wrist.x * canvas.width;
            const y = wrist.y * canvas.height;
            
            // Simplified - no trail, just the wrist point
            
            // Draw wrist point in orange
            drawLandmarks(ctx, [wrist], {
                color: '#FF6B35', // Orange
                fillColor: '#FF6B35',
                lineWidth: 2,
                radius: 8 // Larger
            });
        }
        // Remove body detection after countdown - focusing only on shot detection
        
        // Check if countdown is in progress - simplified for performance
        if (!state.shotDetection.isCountdownComplete && state.isTraining) {
            // Check all joints individually
            const jointChecks = {
                wrist: results.poseLandmarks[16],    // Right wrist
                elbow: results.poseLandmarks[14],    // Right elbow
                shoulder: results.poseLandmarks[12], // Right shoulder
                hip: results.poseLandmarks[24],      // Right hip
                knee: results.poseLandmarks[26],     // Right knee
                ankle: results.poseLandmarks[28]     // Right ankle
            };
            
            let allJointsDetected = true;
            
            // Update individual joint indicators
            for (const [joint, landmark] of Object.entries(jointChecks)) {
                const isDetected = landmark && landmark.visibility > 0.5;
                const indicator = document.querySelector(`.joint-indicator[data-joint="${joint}"]`);
                if (indicator) {
                    if (isDetected) {
                        indicator.classList.add('detected');
                    } else {
                        indicator.classList.remove('detected');
                        allJointsDetected = false;
                    }
                }
            }
            
            const currentTime = Date.now();
            
            // Track visibility duration
            if (allJointsDetected) {
                if (!state.visibilityStartTime) {
                    state.visibilityStartTime = Date.now();
                    document.getElementById('trainingStatus').textContent = 'Hold position...';
                } else {
                    const visibilityDuration = Date.now() - state.visibilityStartTime;
                    
                    // Start countdown after 500ms of visibility
                    if (visibilityDuration >= 500 && !state.countdownStarted) {
                        state.countdownStarted = true;
                        // Hide body detection indicators when full body is detected
                        document.querySelectorAll('.joint-indicator').forEach(indicator => {
                            indicator.style.display = 'none';
                        });
                        startCountdown();
                    }
                }
            } else {
                // Reset visibility timer if joints are lost
                state.visibilityStartTime = null;
                const isLeftHanded2 = state.shootingHand === 'left';
                document.getElementById('trainingStatus').textContent = getCurrentLanguage() === 'zh' ? 
                    (isLeftHanded2 ? '请将您的头部左侧面向摄像头' : '请将您的头部右侧面向摄像头') : 
                    (isLeftHanded2 ? 'Position your left side to the camera' : 'Position your right side to the camera');
                
                // Check if we need to trigger voice alert for missing joints
                // Only check if any joint has been missing for more than 500ms
                let shouldAlert = false;
                for (const [joint, isDetected] of Object.entries(state.shotDetection.requiredJoints)) {
                    if (!isDetected) {
                        const lastSeen = state.jointTracking.lastSeenTime[joint];
                        if (lastSeen && currentTime - lastSeen > 500) {
                            shouldAlert = true;
                            break;
                        }
                    }
                }
                
                // Skip voice alerts during active training for performance
            }
        }
        
        // Wrist drawing moved to top for better performance
        
        // Username indicator removed for performance
        
        // Detect shot
        detectShot(results.poseLandmarks);
    } else {
        // Debug display updates removed for performance
    }
    
    // Capture frame for video generation - optimize by reducing getImageData calls
    const currentTime = Date.now();
    
    // Only capture frames when actively tracking shots
    if (state.shotDetection.isCountdownComplete && state.isTraining) {
        // Keep 3 seconds of frames (90 frames at 30fps)
        if (frameBuffer.length >= 90) {
            frameBuffer.shift();
        }
        
        // Store frame data with timestamp for accurate playback
        frameBuffer.push({
            imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
            time: currentTime
        });
    }
    
    } catch (err) {
        console.error('Error in onPoseResults:', err);
    }
}

// Shot detection constants
const VELOCITY_THRESHOLD = 300; // degrees per second
const MAX_ANALYSIS_HISTORY = 90; // 3 seconds at 30fps

// Store longer wrist history for shot analysis (3 seconds)
const wristAnalysisHistory = [];
const angleHistory = { right: [] };
let shotCooldown = 0;
// Store frames for video generation
const frameBuffer = [];

// Find the U-shape bottom in right wrist trajectory
function findShotStart(wristHistory, releaseTime) {
    if (wristHistory.length < 10) {
        return null;
    }
    
    let candidates = [];
    
    // Look back up to 3 seconds from release
    const lookbackTime = releaseTime - 3000;
    
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
    }
    
    // If we found U-shapes, return the nearest one to release (working backwards)
    if (candidates.length > 0) {
        // Sort by time, closest to release first (latest time first)
        candidates.sort((a, b) => b.time - a.time);
        return { ...candidates[0], uShapeFound: true };
    }
    
    // Fallback: No U-shape found - use 3 seconds before release
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
        return { ...closestFrame, uShapeFound: false };
    }
    
    // Ultimate fallback: use the oldest frame we have
    if (wristHistory.length > 0) {
        return { ...wristHistory[0], uShapeFound: false };
    }
    
    return null;
}

// Countdown Timer Function
function startCountdown() {
    const countdownOverlay = document.getElementById('countdownOverlay');
    const countdownNumber = document.getElementById('countdownNumber');
    
    // Show countdown number in center
    countdownNumber.style.display = 'block';
    
    let count = 3;
    countdownNumber.textContent = count;
    countdownNumber.style.animation = 'none';
    
    // Speak the first number
    const countdownWords = getCurrentLanguage() === 'zh' ? 
        ['三', '二', '一', '开始'] : 
        ['Three', 'Two', 'One', 'Go'];
    audioManager.speak(countdownWords[0]);
    
    const countInterval = setInterval(() => {
        count--;
        
        if (count > 0) {
            countdownNumber.textContent = count;
            // Restart animation
            countdownNumber.style.animation = 'none';
            setTimeout(() => {
                countdownNumber.style.animation = 'countdownPulse 1s ease-out';
            }, 10);
            
            // Speak the number
            if (count === 2) audioManager.speak(countdownWords[1]);
            else if (count === 1) audioManager.speak(countdownWords[2]);
        } else {
            clearInterval(countInterval);
            
            // Show "GO!" briefly
            countdownNumber.textContent = getCurrentLanguage() === 'zh' ? '开始!' : 'GO!';
            countdownNumber.style.animation = 'none';
            setTimeout(() => {
                countdownNumber.style.animation = 'countdownPulse 0.5s ease-out';
            }, 10);
            
            // Speak "Go!"
            audioManager.speak(countdownWords[3]);
            
            // Hide overlay and start tracking
            setTimeout(() => {
                countdownOverlay.classList.add('hidden');
                state.shotDetection.isCountdownComplete = true;
                document.getElementById('trainingStatus').textContent = 'Ready! Start shooting';
                
                // Start recording and debug panel
                startRecording();
                startDebugPanel();
            }, 500);
        }
    }, 1000);
}

// Removed animation state - using direct positioning for better performance

// Draw gaming-style username indicator above player's head
function drawUsernameIndicator(ctx, landmarks) {
    // Check if user is logged in and has a name
    if (!state.user || !landmarks) return;
    
    // Get key landmarks for positioning
    const nose = landmarks[0];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    
    if (!nose || !leftShoulder || !rightShoulder) return;
    
    // Calculate shoulder width for size normalization
    const shoulderWidth = Math.abs(rightShoulder.x - leftShoulder.x) * ctx.canvas.width;
    
    // Base the indicator size on shoulder width with minimum size
    const scale = Math.max(shoulderWidth / 150, 0.6); // Minimum scale of 0.6
    
    // Calculate position above head - direct positioning, no smoothing
    const x = nose.x * ctx.canvas.width;
    const y = nose.y * ctx.canvas.height - (shoulderWidth * 0.8); // Position above head
    const currentScale = scale;
    
    // Save context state
    ctx.save();
    
    // Draw shadow for better visibility
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 4 * currentScale;
    ctx.shadowOffsetY = 2 * currentScale;
    
    // Draw inverted triangle
    const triangleSize = 15 * currentScale;
    ctx.beginPath();
    ctx.moveTo(x, y); // Bottom point
    ctx.lineTo(x - triangleSize, y - triangleSize * 1.5); // Top left
    ctx.lineTo(x + triangleSize, y - triangleSize * 1.5); // Top right
    ctx.closePath();
    
    // Fill triangle with orange theme color
    ctx.fillStyle = '#FF6B35';
    ctx.fill();
    
    // Draw username text
    const username = state.user.full_name || 'Player';
    const fontSize = 16 * currentScale;
    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    
    // Text position above triangle
    const textY = y - triangleSize * 1.5 - 5 * currentScale;
    
    // Draw text fill in white (shadow provides contrast)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(username, x, textY);
    
    // Restore context state
    ctx.restore();
}

// Shot Detection
function detectShot(landmarks) {
    // Don't detect shots until countdown is complete
    if (!state.shotDetection.isCountdownComplete) {
        return;
    }
    
    const currentTime = Date.now();
    
    // Debug logging disabled
    
    // Get key points based on shooting hand preference
    const isLeftHanded = state.shootingHand === 'left';
    const wristIndex = isLeftHanded ? 15 : 16;  // Left wrist: 15, Right wrist: 16
    const indexFingerIndex = isLeftHanded ? 19 : 20;  // Left index: 19, Right index: 20
    const shoulderIndex = isLeftHanded ? 11 : 12;  // Left shoulder: 11, Right shoulder: 12
    
    const wrist = landmarks[wristIndex];
    const indexFinger = landmarks[indexFingerIndex];
    const shoulder = landmarks[shoulderIndex];
    const nose = landmarks[0];
    
    if (!wrist || !indexFinger || !nose) {
        return;
    }
    
    // Convert to canvas coordinates
    const wristCanvas = {
        x: wrist.x * canvas.width,
        y: wrist.y * canvas.height
    };
    
    // Add to analysis history with shoulder status
    const wristData = {
        ...wristCanvas,
        time: currentTime,
        belowShoulder: wrist.y > shoulder.y
    };
    
    wristAnalysisHistory.push(wristData);
    if (wristAnalysisHistory.length > MAX_ANALYSIS_HISTORY) wristAnalysisHistory.shift();
    
    // Check if wrist is above nose
    const wristAboveNose = wrist.y < nose.y;
    
    // Debug display updates removed for performance
    
    if (wristAboveNose) {
        // Calculate angle between wrist-index vector
        const dx = indexFinger.x - wrist.x;
        const dy = indexFinger.y - wrist.y;
        
        // Calculate angle from horizontal
        // For right hand: -90° = up, 0° = right, 90° = down, ±180° = left
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        
        // Debug angle display removed for performance
        
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
            
            // Debug velocity display removed for performance
            
            // Check for forward shooting motion
            const isForwardMotion = angleDiff > 0 && recent.angle > -90 && previous.angle < -90;
            const recentAngleInRange = recent.angle > -90 && recent.angle < 0;
            
            if (shotCooldown === 0 &&
                wristAboveNose &&
                recentAngleInRange &&
                isForwardMotion &&
                angularVelocity > VELOCITY_THRESHOLD) {
                
                // Debug state display removed for performance
                
                // Analyze shot start
                const shotStart = findShotStart(wristAnalysisHistory, currentTime);
                if (shotStart) {
                    const shotDuration = (currentTime - shotStart.time) / 1000;
                    // Debug shot info display removed for performance
                    
                    // Store shot data for delayed saving
                    const shotDataToSave = {
                        duration: shotDuration,
                        velocity: angularVelocity,
                        startTime: shotStart.time,
                        releaseTime: currentTime,
                        uShapeFound: shotStart.uShapeFound
                    };
                    
                    // Wait 300ms to capture post-release frames like debug version
                    setTimeout(() => {
                        console.log('Saving shot video after 300ms delay to capture follow-through');
                        saveShotData(shotDataToSave);
                    }, 300);
                    
                    // Show feedback
                    showShotFeedback(shotDuration, angularVelocity);
                }
                
                // Set cooldown - reduced for faster detection
                shotCooldown = 30; // 1 second at 30fps
            }
        }
    } else {
        // Clear angle history when wrist is below nose
        angleHistory.right = [];
        // Debug angle display reset removed for performance
    }
    
    // Update cooldown
    if (shotCooldown > 0) {
        shotCooldown--;
        // Debug state display removed for performance
    }
}


// Show Shot Feedback
function showShotFeedback(duration, velocity) {
    // Play shot detection sound
    audioManager.playShotSound();
    
    // Update session counter
    state.sessionShots++;
    document.getElementById('sessionShots').textContent = state.sessionShots;
    
    // Check if target shots reached
    if (state.trainingSettings.mode === 'shots' && 
        state.sessionShots >= state.trainingSettings.targetShots && 
        !state.trainingSettings.targetReached) {
        state.trainingSettings.targetReached = true;
        document.getElementById('trainingStatus').textContent = 'Target reached! Great shooting!';
        setTimeout(() => stopTraining(), 2000);
    } else if (state.trainingSettings.mode === 'shots' && !state.trainingSettings.targetReached) {
        const remaining = state.trainingSettings.targetShots - state.sessionShots;
        document.getElementById('trainingStatus').textContent = `${remaining} shots to go!`;
    }
    
    // Show large counter animation
    const counterLarge = document.getElementById('shotCounterLarge');
    if (counterLarge) {
        counterLarge.textContent = state.sessionShots;
        counterLarge.style.animation = 'none';
        setTimeout(() => {
            counterLarge.style.animation = 'shotPop 0.6s ease-out';
        }, 10);
    }
    
    // Add haptic feedback class
    document.body.classList.add('haptic');
    setTimeout(() => {
        document.body.classList.remove('haptic');
    }, 100);
}

// Generate video clip from frameBuffer
async function generateVideoFromFrames(startTime, endTime) {
    // Add 300ms padding to match debug version
    const paddedStartTime = startTime - 300;
    const paddedEndTime = endTime + 300;
    
    // Filter frames within the padded period
    const shotFrames = frameBuffer.filter(frame => 
        frame.time >= paddedStartTime && frame.time <= paddedEndTime
    );
    
    if (shotFrames.length === 0) {
        console.error('No frames found for the specified time range');
        return null;
    }
    
    
    // Create a canvas for video generation
    const videoCanvas = document.createElement('canvas');
    const canvas = document.getElementById('canvas');
    videoCanvas.width = canvas.width;
    videoCanvas.height = canvas.height;
    const videoCtx = videoCanvas.getContext('2d');
    
    // Set up MediaRecorder
    const stream = videoCanvas.captureStream(30);
    const recorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9'
    });
    
    return new Promise((resolve, reject) => {
        const chunks = [];
        
        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                chunks.push(e.data);
            }
        };
        
        recorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            resolve(blob);
        };
        
        recorder.onerror = (e) => {
            reject(e);
        };
        
        // Start recording
        recorder.start();
        
        // Simple playback at recorded speed
        console.log(`📹 Generating video with ${shotFrames.length} frames`);
        
        let frameIndex = 0;
        const startTimestamp = shotFrames[0].time;
        const playbackStartTime = Date.now();
        
        const playbackFrame = () => {
            if (frameIndex >= shotFrames.length) {
                recorder.stop();
                return;
            }
            
            const currentFrame = shotFrames[frameIndex];
            
            // Draw the current frame
            videoCtx.putImageData(currentFrame.imageData, 0, 0);
            
            frameIndex++;
            
            if (frameIndex < shotFrames.length) {
                // Play at original recorded speed
                const nextFrame = shotFrames[frameIndex];
                const currentTime = currentFrame.time - startTimestamp;
                const nextTime = nextFrame.time - startTimestamp;
                const actualInterval = nextTime - currentTime;
                
                setTimeout(playbackFrame, actualInterval);
            } else {
                // Last frame - stop after a short delay
                setTimeout(() => recorder.stop(), 100);
            }
        };
        
        playbackFrame();
    });
}

// Save Shot Data
async function saveShotData(shotData) {
    if (!state.user) {
        return;
    }
    
    try {
        // Calculate video boundaries with padding
        // Always use the actual startTime from findShotStart and add 300ms padding to match debug
        const videoStartTime = shotData.startTime - 300;
        const videoEndTime = shotData.releaseTime + 300;
        
        // Using correct timing logic with 300ms padding
        
        // Generate video clip from frameBuffer
        const videoBlob = await generateVideoFromFrames(shotData.startTime, shotData.releaseTime);
        
        if (!videoBlob) {
            console.error('No video clip available for this shot');
            return;
        }
        
        // Calculate actual shot speed (duration between start and release)
        let shotSpeed = null;
        if (shotData.uShapeFound || shotData.duration < 3) {
            // We found the actual start point
            shotSpeed = shotData.duration;
        }
        // If duration >= 3 seconds and no U-shape, we don't know the actual start
        
        // Enhanced shot data
        const enhancedShotData = {
            ...shotData,
            shotSpeed, // null if we couldn't detect start point
            needsAdjustment: !shotData.uShapeFound && shotData.duration >= 3,
            made: false, // User will mark this later
            shotNumber: state.sessionShots + 1 // Add shot number for display
        };
        
        // Save to IndexedDB instead of Supabase
        
        // Save directly to IndexedDB
        try {
            if (!db) await initDB();
            
            const videoData = {
                filename: `shot_${state.user.id}_${state.sessionId}_${Date.now()}.webm`,
                timestamp: Date.now(),
                blob: videoBlob,
                sessionId: state.sessionId,
                userId: state.user.id,
                shotData: enhancedShotData
            };
            
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.add(videoData);
            
            request.onsuccess = () => {
            };
            
            request.onerror = () => {
                console.error(' Error saving shot to IndexedDB:', request.error);
            };
        } catch (error) {
            console.error(' Error saving to IndexedDB:', error);
        }
    } catch (err) {
        console.error('Error in saveShotData:', err);
    }
}

// Stop Training
function stopTraining() {
    // Prevent duplicate calls
    if (!state.isTraining) {
        return;
    }
    
    state.isTraining = false;
    
    // Clear timer if running
    if (state.trainingSettings.timerInterval) {
        clearInterval(state.trainingSettings.timerInterval);
        state.trainingSettings.timerInterval = null;
    }
    
    // Stop camera
    if (state.cameraHelper) {
        state.cameraHelper.stop();
        state.cameraHelper = null;
    }
    
    // Hide camera flip button
    const flipBtn = document.getElementById('cameraFlipBtn');
    if (flipBtn) {
        flipBtn.style.display = 'none';
    }
    
    // Remove mirror effect
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    if (video) video.classList.remove('mirror');
    if (canvas) canvas.classList.remove('mirror');
    
    // No longer using recording interval
    
    // No longer using continuous MediaRecorder
    
    // Clear pose
    if (state.pose) {
        state.pose.close();
        state.pose = null;
    }
    
    // Show summary without blocking UI
    const duration = Math.floor((Date.now() - state.trainingStartTime) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    
    // Show non-blocking summary
    console.log(`Training complete! Shots: ${state.sessionShots}, Duration: ${minutes}:${seconds.toString().padStart(2, '0')}`);
    
    // Delay navigation to allow cleanup to complete
    setTimeout(() => {
        navigateTo('replays');
    }, 100);
}

// Exit Training - Optimized without blocking confirm dialog
function exitTraining() {
    // Instead of blocking confirm, stop immediately and show a brief message
    const wasTraining = state.isTraining;
    
    if (wasTraining) {
        // Show exit message briefly
        const statusEl = document.getElementById('trainingStatus');
        if (statusEl) {
            statusEl.textContent = getCurrentLanguage() === 'zh' ? '训练已结束' : 'Training ended';
        }
        
        // Stop training immediately without blocking
        stopTraining();
    }
}

// Load Replays
async function loadReplays() {
    if (!state.user) return;
    
    const replaysEl = document.getElementById('replaysList');
    replaysEl.innerHTML = '<div class="skeleton" style="height: 200px; border-radius: 12px;"></div>';
    
    try {
        const { data: shots } = await simpleShots.getShots(50);
        
        if (shots && shots.length > 0) {
            replaysEl.innerHTML = shots.map(shot => {
                const date = new Date(shot.created_at);
                return `
                    <div class="replay-card" onclick="playReplay(${shot.id})">
                        <div class="replay-thumbnail">
                            <div class="replay-badges">
                                <div class="badge">
                                    <svg viewBox="0 0 24 24" fill="currentColor" class="badge-icon">
                                        <path d="M13 2L3 14h8l-2 8 10-12h-8l2-8z"/>
                                    </svg>
                                    ${Math.round(shot.velocity)}°/s
                                </div>
                                <div class="badge">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="badge-icon">
                                        <circle cx="12" cy="12" r="10"/>
                                        <polyline points="12 6 12 12 16 14"/>
                                    </svg>
                                    ${shot.duration.toFixed(1)}s
                                </div>
                            </div>
                            <div class="replay-play">
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M8 5v14l11-7z"/>
                                </svg>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            replaysEl.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="empty-icon">
                        <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
                        <line x1="7" y1="2" x2="7" y2="22"/>
                        <line x1="17" y1="2" x2="17" y2="22"/>
                        <line x1="2" y1="12" x2="22" y2="12"/>
                    </svg>
                    <p>${t('noReplaysYet')}</p>
                </div>
            `;
        }
    } catch (err) {
        console.error('Error loading replays:', err);
        replaysEl.innerHTML = '<div class="empty-state"><p>Error loading replays</p></div>';
    }
}

// Play Replay - Video Editor
async function playReplay(shotId) {
    
    // Convert shotId to number if it's a string
    const numericId = typeof shotId === 'string' ? parseInt(shotId, 10) : shotId;
    
    try {
        // Always try IndexedDB first since we're storing videos locally
        const videoData = await getVideo(numericId);
        
        // Check for video source - either blob or URL
        const videoBlob = videoData?.videoBlob || videoData?.blob;
        const videoUrl = videoData?.videoUrl;
        
        if (videoData && (videoBlob || videoUrl)) {
            
            if (videoUrl) {
            } else if (videoBlob) {
            }
            
            // Show modal
            const modal = document.getElementById('videoModal');
            const video = document.getElementById('modalVideo');
            const stats = document.getElementById('modalStats');
            
            
            if (!modal || !video) {
                console.error(' Modal or video element not found!');
                return;
            }
            
            // Determine video source
            let finalVideoUrl;
            
            if (videoUrl) {
                // Direct URL from Supabase
                finalVideoUrl = videoUrl;
            } else if (videoBlob) {
                // Blob from IndexedDB
                let blob = videoBlob;
                if (!blob.type || blob.type === '') {
                    // Create a new blob with proper MIME type
                    blob = new Blob([blob], { type: 'video/webm' });
                }
                
                // Create object URL from blob
                finalVideoUrl = URL.createObjectURL(blob);
            } else {
                console.error(' No video source found!');
                alert('Video not found');
                return;
            }
            
            // Stop any current playback
            video.pause();
            
            // Clean up previous object URL if exists
            if (video.src && video.src.startsWith('blob:')) {
                URL.revokeObjectURL(video.src);
            }
            
            // Add mobile-specific attributes
            video.setAttribute('playsinline', 'true');
            video.setAttribute('webkit-playsinline', 'true');
            video.setAttribute('x5-playsinline', 'true');
            video.setAttribute('x5-video-player-type', 'h5');
            video.setAttribute('x-webkit-airplay', 'allow');
            video.setAttribute('controls', 'true');
            
            // Set video source
            video.src = finalVideoUrl;
            
            // Force reload
            video.load();
            
            // Add error handler
            video.onerror = (e) => {
                console.error('Video load error:', e);
                
                // Try fallback format
                if (blob.type === 'video/webm') {
                    const mp4Blob = new Blob([videoBlob], { type: 'video/mp4' });
                    const mp4Url = URL.createObjectURL(mp4Blob);
                    video.src = mp4Url;
                    video.load();
                }
            };
            
            // Add canplay handler for debugging
            video.oncanplay = () => {
            };
            
            // Check supported formats
            
            // Store current shot data for editor
            state.currentEditingShot = videoData;
            
            // Setup video editor timeline
            const setupVideoControls = () => {
                setupVideoTimeline(video, videoData);
                setupPlaybackSpeedControl(video);
            };
            
            // If video metadata is already loaded, setup immediately
            if (video.readyState >= 1) {
                setupVideoControls();
            } else {
                video.onloadedmetadata = setupVideoControls;
            }
            
            // Show the modal
            modal.style.display = 'flex';
            state.videoModalOpen = true;
            
            // Determine detection status
            let detectionStatus = 'Not Detected';
            if (videoData.metadata?.isAdjusted) {
                detectionStatus = 'Adjusted';
            } else if (videoData.uShapeFound) {
                detectionStatus = 'Detected';
            }
            
            // Check if start point was detected
            const startDetected = videoData.uShapeFound || false;
            const needsAdjustment = !startDetected;
            
            // Setup stats display - simplified version
            const shotDate = videoData.timestamp ? new Date(videoData.timestamp) : new Date();
            const dateStr = shotDate.toLocaleDateString();
            const timeStr = shotDate.toLocaleTimeString();
            
            stats.innerHTML = `
                <div style="display: flex; justify-content: center; align-items: stretch; text-align: center; padding: var(--space-lg); gap: var(--space-lg);">
                    <div style="flex: 1; display: flex; flex-direction: column; align-items: center;">
                        <div style="font-size: var(--font-base); font-weight: 600; color: var(--text-primary);">${dateStr}</div>
                        <div style="font-size: var(--font-sm); color: var(--text-secondary); margin-top: 4px;">${timeStr}</div>
                        <div style="color: var(--text-tertiary); margin-top: var(--space-xs); font-size: var(--font-xs); text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap;">${t('dateAndTime')}</div>
                    </div>
                    <div style="width: 1px; background: var(--bg-tertiary); align-self: stretch;"></div>
                    <div style="flex: 1; display: flex; flex-direction: column; align-items: center;">
                        <div style="font-size: var(--font-xl); font-weight: 700; color: var(--accent-primary);">${Math.round((videoData.duration || 0) * 1000)}ms</div>
                        <div style="color: var(--text-tertiary); margin-top: var(--space-xs); font-size: var(--font-xs); text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap;">${t('duration')}</div>
                    </div>
                </div>
            `;
            
            modal.classList.add('show');
            video.play();
        }
    } catch (err) {
        console.error('Error playing replay:', err);
        alert(t('errorLoadingVideo') || 'Error loading video');
    }
}

// Close Video Modal
function closeVideoModal() {
    const modal = document.getElementById('videoModal');
    const video = document.getElementById('modalVideo');
    
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('show');
    }
    
    if (video) {
        video.pause();
        // Clean up object URL
        if (video.src && video.src.startsWith('blob:')) {
            URL.revokeObjectURL(video.src);
        }
    }
    
    state.videoModalOpen = false;
}

// Setup modal close on background click
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('videoModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeVideoModal();
            }
        });
    }
});

// Show Profile
async function showProfile() {
    console.log('showProfile called, state.user:', state.user);
    
    if (!state.user) {
        console.error('No user found in state');
        // Try to get user from Supabase auth
        const user = await simpleAuth.getUser();
        if (user) {
            state.user = user;
            console.log('Loaded user from Supabase:', state.user);
        } else {
            alert('Please log in first');
            navigateTo('landing');
            return;
        }
    }
    
    navigateTo('profile');
    
    // Update profile info
    document.getElementById('profileName').textContent = state.user.full_name || 'User';
    document.getElementById('profileEmail').textContent = state.user.email_or_phone;
    document.getElementById('profileBadge').textContent = `${t('elitePlayer')} #${state.user.id}`;
    
    // Update shooting hand selection
    const userHand = state.user.shooting_hand || state.user.user_metadata?.shooting_hand || 'right';
    document.querySelectorAll('.hand-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    if (userHand === 'left') {
        document.getElementById('handLeft')?.classList.add('active');
    } else {
        document.getElementById('handRight')?.classList.add('active');
    }
}

// Hide Profile
function hideProfile() {
    navigateTo('home');
}

// Logout
function logout() {
    if (confirm('Are you sure you want to log out?')) {
        simpleAuth.signOut();
        state.user = null;
        navigateTo('landing');
        
        // Clear form
        document.getElementById('authForm').reset();
    }
}

// Share App
function shareApp() {
    const shareData = {
        title: 'Shooting Coach',
        text: 'Check out Shooting Coach - AI-powered basketball training!',
        url: window.location.href
    };
    
    if (navigator.share) {
        navigator.share(shareData);
    } else {
        // Fallback - copy to clipboard
        navigator.clipboard.writeText(shareData.url);
        alert('Link copied to clipboard!');
    }
}

// Training Setup Functions
function selectTrainingMode(mode) {
    // Clear previous selections
    document.querySelectorAll('.training-mode-card').forEach(card => {
        card.classList.remove('active');
    });
    document.querySelectorAll('.mode-input').forEach(input => {
        input.style.display = 'none';
    });
    
    // Set new selection
    state.trainingSettings.mode = mode;
    const selectedCard = event.currentTarget;
    selectedCard.classList.add('active');
    
    // Show input for specific modes
    if (mode === 'shots') {
        document.getElementById('shotsInput').style.display = 'block';
    } else if (mode === 'time') {
        document.getElementById('timeInput').style.display = 'block';
    }
    
    // Update button
    const btn = document.querySelector('.start-training-btn');
    btn.disabled = false;
    btn.querySelector('.btn-text').textContent = 'Start Training';
}


function startTrainingWithSettings() {
    // Get values from inputs
    if (state.trainingSettings.mode === 'shots') {
        state.trainingSettings.targetShots = parseInt(document.getElementById('targetShots').value);
    } else if (state.trainingSettings.mode === 'time') {
        state.trainingSettings.targetTime = parseInt(document.getElementById('targetTime').value);
        state.trainingSettings.timeRemaining = state.trainingSettings.targetTime;
    }
    
    // Navigate to instructions page first
    navigateTo('trainingInstructions');
    
    // Update mode reminder
    const modeText = state.trainingSettings.mode === 'shots' ? 'Shot Count' : 
                     state.trainingSettings.mode === 'time' ? 'Time Trial' : 'Free Practice';
    document.getElementById('modeReminder').textContent = modeText;
    
    // Update target reminder
    const targetEl = document.getElementById('targetReminder');
    if (state.trainingSettings.mode === 'shots') {
        targetEl.textContent = `Target: ${state.trainingSettings.targetShots} shots`;
    } else if (state.trainingSettings.mode === 'time') {
        const minutes = Math.floor(state.trainingSettings.targetTime / 60);
        const seconds = state.trainingSettings.targetTime % 60;
        targetEl.textContent = `Duration: ${minutes}:${seconds.toString().padStart(2, '0')}`;
    } else {
        targetEl.textContent = 'No limits - practice freely';
    }
}


// Load Sessions (from IndexedDB)
async function loadSessions() {
    const sessionsList = document.getElementById('sessionsList');
    
    try {
        // Get all videos from IndexedDB
        const videos = await getAllVideos();
        
        // Group videos by sessionId instead of just date
        const sessionsBySessionId = {};
        videos.forEach(video => {
            const sessionId = video.sessionId || `session-${video.timestamp}`; // Fallback for old videos
            if (!sessionsBySessionId[sessionId]) {
                sessionsBySessionId[sessionId] = {
                    sessionId: sessionId,
                    timestamp: video.timestamp,
                    shots: []
                };
            }
            sessionsBySessionId[sessionId].shots.push(video);
        });
        
        // Convert to array and sort by timestamp (most recent first)
        const sessions = Object.values(sessionsBySessionId).sort((a, b) => b.timestamp - a.timestamp);
        
        if (sessions.length > 0) {
            sessionsList.innerHTML = sessions.map((session, index) => {
                const totalDuration = session.shots.reduce((sum, shot) => sum + (shot.shotData?.duration || 0), 0);
                const avgDuration = totalDuration / session.shots.length;
                
                return `
                    <div class="session-card" data-session-index="${index}">
                        <div class="session-content" onclick="viewLocalSession(${index})">
                            <div class="session-info">
                                <div class="session-date">${formatSessionDate(session.timestamp)}</div>
                                <div class="session-stats">
                                    <div class="session-stat">
                                        <div class="session-stat-value">${session.shots.length}</div>
                                        <div class="session-stat-label">${t('shots')}</div>
                                    </div>
                                    <div class="session-stat">
                                        <div class="session-stat-value">${Math.round(totalDuration)}</div>
                                        <div class="session-stat-label">${t('totalTime')} (s)</div>
                                    </div>
                                    <div class="session-stat">
                                        <div class="session-stat-value">${avgDuration.toFixed(2)}</div>
                                        <div class="session-stat-label">${t('avgDuration')} (s)</div>
                                    </div>
                                </div>
                            </div>
                            <svg class="session-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M9 18l6-6-6-6"/>
                            </svg>
                        </div>
                        <button class="session-delete-btn" onclick="deleteLocalSession(${index}, event)" title="Delete session">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6"/>
                            </svg>
                        </button>
                    </div>
                `;
            }).join('');
            
            // Store sessions in state for later use
            state.localSessions = sessions;
            
            // Add swipe functionality
            setupSwipeToDelete();
            
            // Show edit button if we have sessions
            if (window.showEditButton) {
                window.showEditButton();
            }
        } else {
            sessionsList.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="empty-icon">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                    </svg>
                    <p class="empty-text">No training sessions yet!</p>
                </div>
            `;
            
            // Hide edit button when no sessions
            if (window.showEditButton) {
                const editButton = document.getElementById('editButton');
                if (editButton) editButton.style.display = 'none';
            }
        }
    } catch (err) {
        console.error('Error loading sessions:', err);
        sessionsList.innerHTML = '<p class="error-text">Failed to load sessions</p>';
    }
}

// View Local Session Details
window.viewLocalSession = async function(sessionIndex) {
    // Navigate immediately to show loading state
    document.getElementById('sessionsView').style.display = 'none';
    document.getElementById('sessionDetailsView').style.display = 'block';
    
    const session = state.localSessions[sessionIndex];
    if (!session) return;
    
    document.getElementById('sessionTitle').textContent = formatSessionDate(session.timestamp);
    
    const shotsList = document.getElementById('sessionShotsList');
    shotsList.innerHTML = session.shots.map((shot, index) => {
        const timestamp = new Date(shot.timestamp).toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });
        
        return `
        <div class="shot-card" data-shot-id="${shot.id}">
            <div class="shot-media">
                <span class="shot-number-badge">${t('shotNumber')} ${index + 1}</span>
                <video id="video-${shot.id}" class="shot-video" muted></video>
            </div>
            <div class="shot-info">
                <div class="shot-stats">
                    <div class="shot-stat">
                        <span class="shot-stat-label">${t('duration')}</span>
                        <span class="shot-stat-value">${shot.shotData?.duration?.toFixed(2) || 'N/A'}s</span>
                    </div>
                    <span class="shot-timestamp">${timestamp}</span>
                </div>
                <div class="shot-actions">
                    <button class="shot-action-btn delete" onclick="event.stopPropagation(); deleteLocalVideo(${shot.id})">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14M10 11v6M14 11v6"/>
                        </svg>
                        <span class="list-view-only">Delete</span>
                    </button>
                </div>
            </div>
        </div>
    `}).join('');
    
    // Load video blobs into video elements
    session.shots.forEach(shot => {
        const videoEl = document.getElementById(`video-${shot.id}`);
        if (videoEl && shot.blob) {
            const url = URL.createObjectURL(shot.blob);
            videoEl.src = url;
            videoEl.onended = () => URL.revokeObjectURL(url);
        }
    });
}

// Delete local video
window.deleteLocalVideo = async function(videoId) {
    if (confirm('Delete this video?')) {
        try {
            await deleteVideo(videoId);
            // Reload the current session view
            await loadSessions();
            // Go back to sessions list
            backToSessions();
        } catch (err) {
            console.error('Error deleting video:', err);
            alert('Failed to delete video');
        }
    }
}

// Delete local session
window.deleteLocalSession = async function(sessionIndex, event) {
    event.stopPropagation();
    
    const session = state.localSessions[sessionIndex];
    if (!session) return;
    
    if (confirm(`Delete session from ${formatSessionDate(session.timestamp)}?`)) {
        try {
            // Delete all videos in this session
            for (const shot of session.shots) {
                await deleteVideo(shot.id);
            }
            // Reload sessions
            await loadSessions();
        } catch (err) {
            console.error('Error deleting session:', err);
            alert('Failed to delete session');
        }
    }
}

// View Session Details
async function viewSession(sessionId) {
    // Navigate immediately to show loading state
    document.getElementById('sessionsView').style.display = 'none';
    document.getElementById('sessionDetailsView').style.display = 'block';
    
    // Show loading state
    document.getElementById('sessionShotsList').innerHTML = `
        <div class="loading-container" style="padding: 40px; text-align: center;">
            <div class="loading-spinner" style="width: 40px; height: 40px; margin: 0 auto 20px; border: 3px solid var(--bg-tertiary); border-top-color: var(--accent-primary); border-radius: 50%; animation: spin 1s linear infinite;"></div>
            <p style="color: var(--text-secondary);">Loading session...</p>
        </div>
    `;
    
    // Add spinner animation if not exists
    if (!document.getElementById('spinnerStyle')) {
        const style = document.createElement('style');
        style.id = 'spinnerStyle';
        style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
        document.head.appendChild(style);
    }
    
    // Update title
    document.getElementById('sessionTitle').textContent = formatSessionDate(new Date());
    
    const shotsList = document.getElementById('sessionShotsList');
    
    try {
        // For now, get all shots and filter by sessionId
        // Since getSessionShots doesn't exist, we'll use getShots
        const { data: allShots, error } = await simpleShots.getShots();
        const shots = allShots ? allShots.filter(shot => {
            // Match shots by session if possible
            return true; // For now, show all shots
        }) : [];
        
        if (error) throw error;
        
        if (shots && shots.length > 0) {
            // Check current view mode
            const isListView = shotsList.classList.contains('list-view');
            
            shotsList.innerHTML = shots.map((shot, index) => {
                const shotSpeed = shot.shotSpeed !== null && shot.shotSpeed !== undefined ? 
                    shot.shotSpeed.toFixed(2) + 's' : 'Not detected';
                const needsAdjustment = shot.needsAdjustment || shot.shotSpeed === null;
                
                // For list view, return simplified HTML
                if (isListView) {
                    const timestamp = new Date(shot.created_at).toLocaleTimeString('en-US', { 
                        hour: 'numeric', 
                        minute: '2-digit',
                        hour12: true 
                    });
                    
                    return `
                    <div class="session-shot-card" data-shot-id="${shot.id}" onclick="playReplay(${shot.id})">
                        <div class="shot-number-cell">
                            <span class="shot-number">Shot ${index + 1}</span>
                        </div>
                        <div class="session-shot-info">
                            <div class="session-shot-stats">
                                <div class="shot-stat-item">
                                    <div class="shot-stat-value">${Math.round(shot.velocity || 0)}</div>
                                    <div class="shot-stat-label">°/s</div>
                                </div>
                                <div class="shot-stat-item">
                                    <div class="shot-stat-value">${shot.duration.toFixed(1)}</div>
                                    <div class="shot-stat-label">sec</div>
                                </div>
                                <div class="shot-stat-item">
                                    <div class="shot-stat-value">${shot.uShapeFound ? '✓' : '✗'}</div>
                                    <div class="shot-stat-label">Detected</div>
                                </div>
                            </div>
                            <div class="shot-time">${timestamp}</div>
                            <button class="replay-delete-btn" onclick="event.stopPropagation(); deleteShot('${shot.id}')">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                                    <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                    `;
                }
                
                // Grid view - with video thumbnails
                // Ensure we have a full URL for the video
                let videoUrl = '';
                if (shot.video_data) {
                    
                    // Check if it's already a full Supabase URL
                    if (shot.video_data.includes('supabase.co/storage/')) {
                        videoUrl = shot.video_data;
                    } else if (shot.video_data.startsWith('http')) {
                        // Some other URL format
                        videoUrl = shot.video_data;
                    } else if (shot.video_data.startsWith('videos/')) {
                        // Legacy storage path - video no longer available
                        videoUrl = '';
                    } else {
                        videoUrl = shot.video_data;
                    }
                } else {
                }
                
                return `
                <div class="session-shot-card" data-shot-id="${shot.id}">
                    <button class="replay-delete-btn" onclick="deleteShot('${shot.id}')">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                            <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/>
                        </svg>
                    </button>
                    <div class="session-shot-thumbnail" onclick="playReplay(${shot.id})">
                        ${videoUrl ? `<video 
                            src="${videoUrl}" 
                            muted 
                            preload="metadata" 
                            onloadedmetadata="this.currentTime=0.1;this.play().then(()=>this.pause()).catch(()=>{})"
                            onerror="console.error('Video preview error for shot ${index + 1}:', this.error)"
                        ></video>` : ''}
                        <div class="shot-overlay-info">
                            <span class="shot-number">#${index + 1}</span>
                            <span class="shot-duration">${shotSpeed}</span>
                        </div>
                    </div>
                    <div class="session-shot-info">
                        <div class="session-shot-stats">
                            <div class="shot-stat-item">
                                <div class="shot-stat-value">${Math.round((shot.duration || 0) * 1000)}</div>
                                <div class="shot-stat-label">ms</div>
                            </div>
                            <div class="shot-stat-item">
                                <div class="shot-stat-value">${shot.uShapeFound ? '✓' : '✗'}</div>
                                <div class="shot-stat-label">Detected</div>
                            </div>
                        </div>
                        <div class="shot-actions">
                            <button class="shot-action-btn ${shot.made ? 'made' : 'missed'}" 
                                    onclick="toggleShotMade('${shot.id}')">
                                ${shot.made ? `✓ ${t('made')}` : `✗ ${t('missed')}`}
                            </button>
                            ${needsAdjustment ? `
                                <button class="shot-action-btn" onclick="adjustShotStart('${shot.id}')">
                                    ${t('adjustStart')}
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
                `;
            }).join('');
            
            // Force first video to load after a short delay
            setTimeout(() => {
                const firstVideo = shotsList.querySelector('video');
                if (firstVideo) {
                    firstVideo.load();
                    // Try to show a frame
                    firstVideo.addEventListener('loadeddata', () => {
                        firstVideo.currentTime = 0.1;
                        firstVideo.play().then(() => {
                            firstVideo.pause();
                        }).catch(err => {
                            console.error(' First video play error:', err);
                        });
                    }, { once: true });
                }
            }, 100);
        } else {
            shotsList.innerHTML = `<p class="empty-text">${t('noShotsInSession')}</p>`;
        }
    } catch (err) {
        console.error('Error loading session shots:', err);
        shotsList.innerHTML = '<p class="error-text">Failed to load shots</p>';
    }
}

// Back to Sessions
function backToSessions() {
    document.getElementById('sessionsView').style.display = 'block';
    document.getElementById('sessionDetailsView').style.display = 'none';
}

// Format session date
function formatSessionDate(dateStr) {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
        return `Today at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
    } else if (date.toDateString() === yesterday.toDateString()) {
        return `Yesterday at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
    } else {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + 
               ` at ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
    }
}

// Format shot time
function formatShotTime(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
}

// Delete Shot
async function deleteShot(shotId) {
    if (!confirm('Delete this shot? This action cannot be undone.')) {
        return;
    }
    
    try {
        const { error } = await simpleShots.deleteShot(shotId);
        
        if (error) throw error;
        
        // Remove the card from UI
        const card = document.querySelector(`[data-shot-id="${shotId}"]`);
        if (card) {
            card.style.transition = 'all 0.3s ease';
            card.style.opacity = '0';
            card.style.transform = 'scale(0.8)';
            setTimeout(() => card.remove(), 300);
        }
        
        // Update stats
        updateStats();
        
    } catch (err) {
        console.error('Error deleting shot:', err);
        alert('Failed to delete shot');
    }
}

// View Mode Management
window.setViewMode = function(mode) {
    const container = document.getElementById('sessionShotsList');
    const listBtn = document.getElementById('listViewBtn');
    const gridBtn = document.getElementById('gridViewBtn');
    
    if (mode === 'list') {
        container.classList.remove('grid-view');
        container.classList.add('list-view');
        listBtn.classList.add('active');
        gridBtn.classList.remove('active');
    } else {
        container.classList.remove('list-view');
        container.classList.add('grid-view');
        listBtn.classList.remove('active');
        gridBtn.classList.add('active');
    }
    
    // Save preference
    localStorage.setItem('shotsViewMode', mode);
}

// Load saved view mode on page load
document.addEventListener('DOMContentLoaded', () => {
    const savedViewMode = localStorage.getItem('shotsViewMode') || 'grid';
    if (document.getElementById('sessionShotsList')) {
        setViewMode(savedViewMode);
    }
});

// Make functions global
window.navigateTo = navigateTo;
window.startTraining = startTraining;
window.stopTraining = stopTraining;
window.exitTraining = exitTraining;
window.showProfile = showProfile;
window.hideProfile = hideProfile;
window.logout = logout;
window.shareApp = shareApp;
window.playReplay = playReplay;
window.closeVideoModal = closeVideoModal;
window.changeLanguage = changeLanguage;

// Change shooting hand function
function changeShootingHand(hand) {
    // Save preference to localStorage
    // Shooting hand is now saved in Supabase user metadata
    
    // Update user profile if logged in
    if (state.user) {
        state.user.shooting_hand = hand;
        // Update in database
        supabase.from('sc_simple_users')
            .update({ shooting_hand: hand })
            .eq('id', state.user.id)
            .then(() => {
                console.log('Shooting hand updated in database');
                // Update session storage
                sessionStorage.setItem('shootingCoachUser', JSON.stringify(state.user));
            })
            .catch(console.error);
    }
    
    // Update active button
    document.querySelectorAll('.hand-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    if (hand === 'right') {
        document.getElementById('handRight')?.classList.add('active');
    } else {
        document.getElementById('handLeft')?.classList.add('active');
    }
    
    // Update global state
    state.shootingHand = hand;
    
    console.log('Shooting hand changed to:', hand);
}

// Initialize shooting hand preference
state.shootingHand = 'right'; // Default, will be updated when user loads

// Set the correct button as active on load
document.addEventListener('DOMContentLoaded', () => {
    if (state.shootingHand === 'left') {
        document.getElementById('handRight')?.classList.remove('active');
        document.getElementById('handLeft')?.classList.add('active');
    }
});

window.changeShootingHand = changeShootingHand;

// Update shooting instructions based on hand preference
function updateShootingInstructions() {
    const isLeftHanded = state.shootingHand === 'left';
    const titleElement = document.getElementById('shootingSideTitle');
    const descElement = document.getElementById('shootingSideDesc');
    
    if (titleElement && descElement) {
        // Update the data-i18n attributes
        titleElement.setAttribute('data-i18n', isLeftHanded ? 'shootLeftSide' : 'shootRightSide');
        descElement.setAttribute('data-i18n', isLeftHanded ? 'shootLeftDesc' : 'shootRightDesc');
        
        // Update the text content using current language
        titleElement.textContent = t(isLeftHanded ? 'shootLeftSide' : 'shootRightSide');
        descElement.textContent = t(isLeftHanded ? 'shootLeftDesc' : 'shootRightDesc');
    }
}

// Tab switching function for shot details
window.showTab = function(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.style.display = 'none';
    });
    
    // Remove active class from all buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab
    const selectedTab = document.getElementById(`${tabName}-tab`);
    if (selectedTab) {
        selectedTab.style.display = 'block';
    }
    
    // Add active class to the correct button
    document.querySelectorAll('.tab-button').forEach(btn => {
        if (btn.textContent.toLowerCase().includes(tabName)) {
            btn.classList.add('active');
        }
    });
};

// Play local replay from session details
window.playLocalReplay = async function(shotId) {
    const session = state.localSessions.find(s => 
        s.shots.some(shot => shot.id === shotId)
    );
    
    if (session) {
        const shot = session.shots.find(s => s.id === shotId);
        
        // Check for both possible field names
        const videoBlob = shot?.videoBlob || shot?.blob;
        
        if (shot && videoBlob) {
            // Use existing playReplay logic
            state.currentEditingShot = {
                id: shot.id,
                videoBlob: videoBlob,
                duration: shot.shotData?.duration || 0,
                uShapeFound: shot.shotData?.uShapeFound || false,
                metadata: { isAdjusted: false }
            };
            
            const modal = document.getElementById('videoModal');
            const video = document.getElementById('modalVideo');
            const stats = document.getElementById('modalStats');
            
            
            const videoUrl = URL.createObjectURL(videoBlob);
            video.src = videoUrl;
            
            // Show the modal
            modal.style.display = 'flex';
            state.videoModalOpen = true;
            
            // Setup stats display - simplified version
            const shotDate = new Date(shot.timestamp);
            const dateStr = shotDate.toLocaleDateString();
            const timeStr = shotDate.toLocaleTimeString();
            
            stats.innerHTML = `
                <div style="display: flex; justify-content: center; align-items: stretch; text-align: center; padding: var(--space-lg); gap: var(--space-lg);">
                    <div style="flex: 1; display: flex; flex-direction: column; align-items: center;">
                        <div style="font-size: var(--font-base); font-weight: 600; color: var(--text-primary);">${dateStr}</div>
                        <div style="font-size: var(--font-sm); color: var(--text-secondary); margin-top: 4px;">${timeStr}</div>
                        <div style="color: var(--text-tertiary); margin-top: var(--space-xs); font-size: var(--font-xs); text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap;">${t('dateAndTime')}</div>
                    </div>
                    <div style="width: 1px; background: var(--bg-tertiary); align-self: stretch;"></div>
                    <div style="flex: 1; display: flex; flex-direction: column; align-items: center;">
                        <div style="font-size: var(--font-xl); font-weight: 700; color: var(--accent-primary);">${Math.round((shot.shotData?.duration || 0) * 1000)}ms</div>
                        <div style="color: var(--text-tertiary); margin-top: var(--space-xs); font-size: var(--font-xs); text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap;">${t('duration')}</div>
                    </div>
                </div>
            `;
            
            modal.classList.add('show');
            video.play();
        }
    }
}
// Add applyPreset function
function applyPreset(presetType) {
    console.log('Applying preset:', presetType);
    // For now, just log - functionality to be implemented when professional mode is developed
    alert('Professional mode features are under development');
}

window.selectTrainingMode = selectTrainingMode;
window.applyPreset = applyPreset;
window.startTrainingWithSettings = startTrainingWithSettings;
window.viewSession = viewSession;
window.backToSessions = backToSessions;
window.deleteShot = deleteShot;
window.deleteSession = deleteSession;

// Setup swipe to delete functionality
function setupSwipeToDelete() {
    const sessionCards = document.querySelectorAll('.session-card');
    
    sessionCards.forEach(card => {
        let startX = 0;
        let currentX = 0;
        let isDragging = false;
        
        const content = card.querySelector('.session-content');
        
        // Touch events
        content.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            isDragging = true;
        }, { passive: true });
        
        content.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            
            currentX = e.touches[0].clientX;
            const diffX = startX - currentX;
            
            // If swiping left
            if (diffX > 50) {
                card.classList.add('swiped');
            } else if (diffX < -50) {
                card.classList.remove('swiped');
            }
        }, { passive: true });
        
        content.addEventListener('touchend', () => {
            isDragging = false;
        });
        
        // Mouse events for desktop testing
        content.addEventListener('mousedown', (e) => {
            startX = e.clientX;
            isDragging = true;
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            currentX = e.clientX;
            const diffX = startX - currentX;
            
            // If swiping left
            if (diffX > 50) {
                card.classList.add('swiped');
            } else if (diffX < -50) {
                card.classList.remove('swiped');
            }
        });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
        
        // Click outside to close
        document.addEventListener('click', (e) => {
            if (!card.contains(e.target)) {
                card.classList.remove('swiped');
            }
        });
    });
}

// Delete session
async function deleteSession(sessionId, event) {
    // Prevent event bubbling to the card click
    event.stopPropagation();
    
    if (!confirm('Are you sure you want to delete this entire session?')) {
        return;
    }
    
    // Optimistic UI update - remove the card immediately
    const sessionCard = document.querySelector(`[data-session-id="${sessionId}"]`);
    if (sessionCard) {
        // Add delete animation
        sessionCard.style.transition = 'all 0.3s ease';
        sessionCard.style.transform = 'translateX(-100%)';
        sessionCard.style.opacity = '0';
        sessionCard.style.height = sessionCard.offsetHeight + 'px';
        
        setTimeout(() => {
            sessionCard.style.height = '0';
            sessionCard.style.marginBottom = '0';
            sessionCard.style.padding = '0';
        }, 300);
        
        setTimeout(() => {
            sessionCard.remove();
            
            // Check if no sessions left
            const remainingSessions = document.querySelectorAll('.session-card');
            if (remainingSessions.length === 0) {
                document.getElementById('sessionsList').innerHTML = `
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="empty-icon">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                            <circle cx="8.5" cy="8.5" r="1.5"/>
                            <polyline points="21 15 16 10 5 21"/>
                        </svg>
                        <p>No training sessions yet</p>
                    </div>
                `;
            }
        }, 600);
    }
    
    try {
        // Delete from database in background
        const { error } = await supabase
            .from('sc_simple_shots')
            .delete()
            .eq('session_id', sessionId);
            
        if (error) throw error;
        
        // Update stats in background
        await simpleShots.updateStats(state.user.id);
        
        // Reload stats on dashboard
        await loadStats();
        
    } catch (err) {
        console.error('Error deleting session:', err);
        // If error, reload the page to show correct state
        await loadSessions();
        alert('Failed to delete session. Please try again.');
    }
}

// Toggle shot made/missed status
async function toggleShotMade(shotId) {
    try {
        // Find the shot card
        const shotCard = document.querySelector(`[data-shot-id="${shotId}"]`);
        if (shotCard) {
            const btn = shotCard.querySelector('.shot-action-btn');
            const isMade = btn.classList.contains('made');
            
            if (isMade) {
                // Currently made, switch to missed
                btn.classList.remove('made');
                btn.classList.add('missed');
                btn.innerHTML = `✗ ${t('missed')}`;
            } else {
                // Currently missed, switch to made
                btn.classList.remove('missed');
                btn.classList.add('made');
                btn.innerHTML = `✓ ${t('made')}`;
            }
            
            // TODO: Save to database
        }
    } catch (err) {
        console.error('Error toggling shot made:', err);
    }
}
window.toggleShotMade = toggleShotMade;

// Setup video timeline
function setupVideoTimeline(video, shot) {
    const timeline = document.getElementById('videoTimeline');
    const startMarker = document.getElementById('startMarker');
    const endMarker = document.getElementById('endMarker');
    const playhead = document.getElementById('playhead');
    const progress = document.getElementById('timelineProgress');
    const durationBar = document.getElementById('shotDurationBar');
    const durationLabel = document.getElementById('videoDurationLabel');
    
    const videoDuration = video.duration;
    durationLabel.textContent = videoDuration.toFixed(1) + 's';
    
    // Calculate marker positions
    let startTime = 0;
    let endTime = shot.duration || videoDuration;
    
    // If start point wasn't detected, default to 3 seconds before end
    if (!shot.metadata?.uShapeFound) {
        startTime = Math.max(0, endTime - 3);
    }
    
    // If we have adjusted times, use those
    if (shot.metadata?.isAdjusted && shot.metadata?.adjustedStartTime !== undefined) {
        startTime = shot.metadata.adjustedStartTime;
        endTime = shot.metadata.adjustedEndTime || endTime;
    }
    
    // Position markers
    const startPercentage = (startTime / videoDuration) * 100;
    const endPercentage = (endTime / videoDuration) * 100;
    
    startMarker.style.left = startPercentage + '%';
    endMarker.style.left = endPercentage + '%';
    
    // Update shot duration bar
    durationBar.style.left = startPercentage + '%';
    durationBar.style.width = (endPercentage - startPercentage) + '%';
    
    // Store current positions for reset
    state.originalStartTime = startTime;
    state.originalEndTime = endTime;
    
    // Update playhead on video progress
    video.addEventListener('timeupdate', () => {
        const percentage = (video.currentTime / videoDuration) * 100;
        playhead.style.left = percentage + '%';
        progress.style.width = percentage + '%';
    });
    
    // Make timeline clickable
    timeline.addEventListener('click', (e) => {
        if (!state.isEditingTimeline && e.target === timeline) {
            const rect = timeline.getBoundingClientRect();
            const percentage = (e.clientX - rect.left) / rect.width;
            video.currentTime = percentage * videoDuration;
        }
    });
}
window.setupVideoTimeline = setupVideoTimeline;

// Setup playback speed control
function setupPlaybackSpeedControl(video) {
    // Store video reference globally for speed control
    window.currentModalVideo = video;
    
    const speedButtons = document.querySelectorAll('.speed-btn');
    console.log('Setting up playback speed control, found buttons:', speedButtons.length);
    
    if (speedButtons.length === 0) {
        console.error('No speed buttons found!');
        return;
    }
    
    // Get saved speed preference or default to 1x
    const savedSpeed = localStorage.getItem('shootingCoachPlaybackSpeed') || '1';
    video.playbackRate = parseFloat(savedSpeed);
    
    // Update active button based on saved speed
    speedButtons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.speed === savedSpeed) {
            btn.classList.add('active');
        }
    });
}

// Global function for speed button clicks
window.setPlaybackSpeed = function(speed) {
    console.log('setPlaybackSpeed called with:', speed);
    
    const video = window.currentModalVideo || document.getElementById('modalVideo');
    if (!video) {
        console.error('No video element found');
        return;
    }
    
    // Update all speed buttons
    const speedButtons = document.querySelectorAll('.speed-btn');
    speedButtons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.speed === speed.toString()) {
            btn.classList.add('active');
        }
    });
    
    // Set video playback rate
    video.playbackRate = parseFloat(speed);
    console.log('Video playback rate set to:', speed);
    
    // Save preference
    localStorage.setItem('shootingCoachPlaybackSpeed', speed.toString());
}

// Toggle timeline editing
function toggleTimelineEdit() {
    state.isEditingTimeline = !state.isEditingTimeline;
    const btn = document.getElementById('adjustTimelineBtn');
    
    if (state.isEditingTimeline) {
        btn.textContent = 'Save Changes';
        btn.style.background = 'var(--accent-primary)';
        enableMarkerDragging();
    } else {
        btn.textContent = 'Adjust Timeline';
        btn.style.background = 'var(--bg-secondary)';
        saveTimelineAdjustments();
    }
}
window.toggleTimelineEdit = toggleTimelineEdit;

// Reset timeline to original positions
function resetTimeline() {
    const video = document.getElementById('modalVideo');
    const startMarker = document.getElementById('startMarker');
    const endMarker = document.getElementById('endMarker');
    const durationBar = document.getElementById('shotDurationBar');
    
    if (state.originalStartTime !== undefined && state.originalEndTime !== undefined) {
        const videoDuration = video.duration;
        
        // Reset to original positions
        const startPercentage = (state.originalStartTime / videoDuration) * 100;
        const endPercentage = (state.originalEndTime / videoDuration) * 100;
        
        startMarker.style.left = startPercentage + '%';
        endMarker.style.left = endPercentage + '%';
        
        // Update duration bar
        durationBar.style.left = startPercentage + '%';
        durationBar.style.width = (endPercentage - startPercentage) + '%';
        
        // Reset video to start position
        video.currentTime = state.originalStartTime;
    }
}
window.resetTimeline = resetTimeline;

// Enable marker dragging
function enableMarkerDragging() {
    const timeline = document.getElementById('videoTimeline');
    const startMarker = document.getElementById('startMarker');
    const endMarker = document.getElementById('endMarker');
    const durationBar = document.getElementById('shotDurationBar');
    const video = document.getElementById('modalVideo');
    
    function makeDraggable(marker, isStart) {
        let isDragging = false;
        
        marker.onmousedown = (e) => {
            if (!state.isEditingTimeline) return;
            isDragging = true;
            marker.style.cursor = 'grabbing';
            marker.style.transform = 'translate(-50%, -50%) scale(1.2)';
            e.preventDefault();
        };
        
        document.onmousemove = (e) => {
            if (!isDragging) return;
            
            const rect = timeline.getBoundingClientRect();
            let percentage = (e.clientX - rect.left) / rect.width;
            percentage = Math.max(0, Math.min(1, percentage));
            
            // Prevent start from going past end and vice versa
            const otherMarker = isStart ? endMarker : startMarker;
            const otherPercentage = parseFloat(otherMarker.style.left) / 100;
            
            if (isStart && percentage >= otherPercentage) {
                percentage = otherPercentage - 0.01;
            } else if (!isStart && percentage <= otherPercentage) {
                percentage = otherPercentage + 0.01;
            }
            
            marker.style.left = (percentage * 100) + '%';
            
            // Update duration bar
            const startPos = parseFloat(startMarker.style.left);
            const endPos = parseFloat(endMarker.style.left);
            durationBar.style.left = startPos + '%';
            durationBar.style.width = (endPos - startPos) + '%';
            
            // Update video preview
            video.currentTime = percentage * video.duration;
            
            // Show time while dragging
            const timeInSeconds = percentage * video.duration;
            const label = marker.querySelector('div[style*="top: -24px"]');
            if (label) {
                const baseText = isStart ? 'Start' : 'Release';
                label.textContent = `${baseText} (${timeInSeconds.toFixed(1)}s)`;
            }
        };
        
        document.onmouseup = () => {
            if (isDragging) {
                isDragging = false;
                marker.style.cursor = 'grab';
                marker.style.transform = 'translate(-50%, -50%)';
                
                // Reset label
                const label = marker.querySelector('div[style*="top: -24px"]');
                if (label) {
                    const baseText = isStart ? 'Start' : 'Release';
                    const isManual = isStart && !state.currentEditingShot.metadata?.uShapeFound;
                    label.textContent = baseText + (isManual ? ' (Manual)' : '');
                }
            }
        };
        
        // Touch support
        marker.ontouchstart = (e) => {
            if (!state.isEditingTimeline) return;
            isDragging = true;
            marker.style.transform = 'translate(-50%, -50%) scale(1.2)';
            e.preventDefault();
        };
        
        marker.ontouchmove = (e) => {
            if (!isDragging) return;
            const touch = e.touches[0];
            const rect = timeline.getBoundingClientRect();
            let percentage = (touch.clientX - rect.left) / rect.width;
            percentage = Math.max(0, Math.min(1, percentage));
            
            // Apply same constraints as mouse
            const otherMarker = isStart ? endMarker : startMarker;
            const otherPercentage = parseFloat(otherMarker.style.left) / 100;
            
            if (isStart && percentage >= otherPercentage) {
                percentage = otherPercentage - 0.01;
            } else if (!isStart && percentage <= otherPercentage) {
                percentage = otherPercentage + 0.01;
            }
            
            marker.style.left = (percentage * 100) + '%';
            
            // Update duration bar
            const startPos = parseFloat(startMarker.style.left);
            const endPos = parseFloat(endMarker.style.left);
            durationBar.style.left = startPos + '%';
            durationBar.style.width = (endPos - startPos) + '%';
            
            video.currentTime = percentage * video.duration;
        };
        
        marker.ontouchend = () => {
            if (isDragging) {
                isDragging = false;
                marker.style.transform = 'translate(-50%, -50%)';
            }
        };
    }
    
    makeDraggable(startMarker, true);
    makeDraggable(endMarker, false);
}

// Save timeline adjustments
async function saveTimelineAdjustments() {
    const video = document.getElementById('modalVideo');
    const startMarker = document.getElementById('startMarker');
    const endMarker = document.getElementById('endMarker');
    
    const startPercentage = parseFloat(startMarker.style.left) / 100;
    const endPercentage = parseFloat(endMarker.style.left) / 100;
    
    const newStartTime = startPercentage * video.duration;
    const newEndTime = endPercentage * video.duration;
    const newDuration = newEndTime - newStartTime;
    
    // Update shot metadata
    const updatedMetadata = {
        ...state.currentEditingShot.metadata,
        isAdjusted: true,
        adjustedStartTime: newStartTime,
        adjustedEndTime: newEndTime
    };
    
    // Update in database
    try {
        await supabase
            .from('sc_simple_shots')
            .update({ 
                duration: newDuration,
                metadata: updatedMetadata 
            })
            .eq('id', state.currentEditingShot.id);
        
        // Update detection status display
        document.querySelector('[style*="Detection"]').previousElementSibling.querySelector('div').textContent = 'Adjusted';
        
        // Update duration display
        const durationElement = Array.from(document.querySelectorAll('.modal-stat-label')).find(el => el.textContent === 'Duration');
        if (durationElement) {
            durationElement.previousElementSibling.textContent = Math.round(newDuration * 1000) + 'ms';
        }
        
    } catch (err) {
        console.error('Error saving timeline adjustments:', err);
    }
}

// Adjust shot start point
function adjustShotStart() {
    // TODO: Implement video editor to adjust start point
    alert('Shot start adjustment coming soon! This will allow you to manually set where your shot begins.');
}
window.adjustShotStart = adjustShotStart;

// Proceed from instructions to camera
function proceedToCamera() {
    startTraining();
}
window.proceedToCamera = proceedToCamera;

// Export state for batch selection
window.state = state;
window.deleteVideo = deleteVideo;
window.loadSessions = loadSessions;

// Camera Alternative Functions for Platform Issues
function showCameraAlternatives(issueType) {
    const trainingView = document.getElementById('training');
    if (!trainingView) return;
    
    // Create alternative UI
    const alternativeUI = document.createElement('div');
    alternativeUI.className = 'camera-alternatives';
    alternativeUI.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 20px;
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 1000;
        text-align: center;
        max-width: 90%;
        width: 350px;
    `;
    
    if (issueType === 'ios_pwa') {
        alternativeUI.innerHTML = `
            <h3 style="margin-bottom: 15px; color: #333;">
                ${getCurrentLanguage() === 'zh' ? '摄像头访问受限' : 'Camera Access Limited'}
            </h3>
            <p style="margin-bottom: 20px; color: #666; font-size: 14px;">
                ${getCurrentLanguage() === 'zh' ? 
                    'iOS应用模式不支持摄像头。请选择以下选项：' : 
                    'iOS app mode doesn\'t support camera. Please choose:'}
            </p>
            <button onclick="window.open(window.location.href, '_blank')" 
                    style="width: 100%; padding: 12px; margin-bottom: 10px; 
                           background: #007AFF; color: white; border: none; 
                           border-radius: 8px; font-size: 16px; cursor: pointer;">
                ${getCurrentLanguage() === 'zh' ? '在Safari中打开' : 'Open in Safari'}
            </button>
            <button onclick="showManualInstructions()" 
                    style="width: 100%; padding: 12px; margin-bottom: 10px; 
                           background: #34C759; color: white; border: none; 
                           border-radius: 8px; font-size: 16px; cursor: pointer;">
                ${getCurrentLanguage() === 'zh' ? '查看详细说明' : 'View Instructions'}
            </button>
            <button onclick="useFallbackCamera()" 
                    style="width: 100%; padding: 12px; margin-bottom: 10px; 
                           background: #FF9500; color: white; border: none; 
                           border-radius: 8px; font-size: 16px; cursor: pointer;">
                ${getCurrentLanguage() === 'zh' ? '使用文件上传' : 'Use File Upload'}
            </button>
            <button onclick="this.parentElement.remove(); navigateTo('home')" 
                    style="width: 100%; padding: 12px; background: #8E8E93; 
                           color: white; border: none; border-radius: 8px; 
                           font-size: 16px; cursor: pointer;">
                ${getCurrentLanguage() === 'zh' ? '返回主页' : 'Return Home'}
            </button>
        `;
    }
    
    trainingView.appendChild(alternativeUI);
}

function showCameraPermissionGuide() {
    const platform = pwaUtils.platform.type;
    let instructions = '';
    
    if (platform === 'iOS') {
        instructions = getCurrentLanguage() === 'zh' ? 
            '设置步骤：\n1. 打开设置\n2. 找到Safari浏览器\n3. 进入"网站设置"\n4. 允许摄像头访问' :
            'Setup steps:\n1. Open Settings\n2. Find Safari\n3. Go to "Website Settings"\n4. Allow camera access';
    } else if (platform === 'Android') {
        instructions = getCurrentLanguage() === 'zh' ? 
            '设置步骤：\n1. 点击地址栏左侧的锁图标\n2. 选择"网站设置"\n3. 允许摄像头权限\n4. 刷新页面' :
            'Setup steps:\n1. Tap the lock icon in address bar\n2. Select "Site settings"\n3. Allow camera permission\n4. Refresh the page';
    } else {
        instructions = getCurrentLanguage() === 'zh' ? 
            '请在浏览器设置中允许摄像头访问权限' :
            'Please allow camera access in browser settings';
    }
    
    alert(instructions);
}

function showManualInstructions() {
    const instructions = getCurrentLanguage() === 'zh' ? 
        'iOS手动操作说明：\n\n' +
        '1. 点击底部分享按钮（方框带箭头图标）\n' +
        '2. 在分享菜单中选择"在Safari中打开"\n' +
        '3. 等待页面在Safari中加载\n' +
        '4. 点击"开始训练"使用摄像头\n\n' +
        '注意：这是iOS系统限制，非应用问题' :
        'iOS Manual Instructions:\n\n' +
        '1. Tap the share button at bottom (box with arrow)\n' +
        '2. Select "Open in Safari" from the menu\n' +
        '3. Wait for page to load in Safari\n' +
        '4. Tap "Start Training" to use camera\n\n' +
        'Note: This is an iOS system limitation';
    
    alert(instructions);
}

// Fallback camera using file input
function useFallbackCamera() {
    const trainingView = document.getElementById('training');
    if (!trainingView) return;
    
    // Create file input for camera capture
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'video/*';
    fileInput.capture = 'environment'; // Use back camera if available
    fileInput.style.display = 'none';
    
    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            // Process the video file
            const videoUrl = URL.createObjectURL(file);
            const video = document.getElementById('video');
            if (video) {
                video.src = videoUrl;
                video.play();
                
                document.getElementById('trainingStatus').textContent = getCurrentLanguage() === 'zh' ? 
                    '视频已加载 - 分析中...' : 'Video loaded - Analyzing...';
                
                // Note: This is a fallback - MediaPipe analysis won't work on uploaded video
                alert(getCurrentLanguage() === 'zh' ? 
                    '提示：上传模式仅供查看，无法进行实时姿势分析' : 
                    'Note: Upload mode is for viewing only, real-time pose analysis not available');
            }
        }
    };
    
    // Clear any existing alternatives UI
    const alternativesUI = document.querySelector('.camera-alternatives');
    if (alternativesUI) alternativesUI.remove();
    
    // Trigger file selection
    document.body.appendChild(fileInput);
    fileInput.click();
    document.body.removeChild(fileInput);
}

// Add diagnostic function for testing
window.testCameraAccess = async function() {
    const diagnostics = pwaUtils.getDiagnostics();
    console.log('Platform Diagnostics:', diagnostics);
    
    // Try to access camera
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop());
        console.log('✅ Camera access successful');
        alert('Camera test successful!');
    } catch (err) {
        console.error('❌ Camera access failed:', err);
        alert(`Camera test failed: ${err.message}`);
    }
    
    return diagnostics;
};

// Export helper functions to window
window.showCameraAlternatives = showCameraAlternatives;
window.showCameraPermissionGuide = showCameraPermissionGuide;
window.showManualInstructions = showManualInstructions;
window.useFallbackCamera = useFallbackCamera;

