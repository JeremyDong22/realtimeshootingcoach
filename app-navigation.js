// PWA Service Worker Registration
if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .then(registration => console.log('ServiceWorker registered'))
            .catch(err => {
                console.log('ServiceWorker registration failed: ', err);
                // Continue app without service worker
            });
    });
} else if (window.location.protocol !== 'https:') {
    console.log('Service Worker requires HTTPS. App will work without offline support.');
}

// App State
const appState = {
    currentPage: 'index',
    isAuthenticated: false,
    user: null,
    stats: {
        totalShots: 0,
        accuracy: 0,
        avgSpeed: 0,
        comDeviation: 0
    },
    heatmapData: {},
    trainingSession: null
};

// Navigation
function navigateTo(page) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    
    // Show selected page
    const pageId = page + 'Page';
    const selectedPage = document.getElementById(pageId);
    if (selectedPage) {
        selectedPage.classList.add('active');
        appState.currentPage = page;
        
        // Update nav bar active state
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        const navItems = document.querySelectorAll('.nav-item');
        const pageIndex = ['community', 'replay', 'training', 'analytics', 'settings'].indexOf(page);
        if (pageIndex >= 0) {
            navItems[pageIndex].classList.add('active');
        }
        
        // Set home as default active when on home page
        if (page === 'home') {
            // Home doesn't have a nav item, so default to training
            navItems[2].classList.add('active');
        }
        
        // Hide nav bar on index, login, and signup pages
        if (page === 'index' || page === 'login' || page === 'signup') {
            document.getElementById('navBar').style.display = 'none';
        } else {
            document.getElementById('navBar').style.display = 'flex';
        }
        
        // Special handling for training page
        if (page === 'training') {
            initializeTraining();
        }
    }
}

// Auth Functions
function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    // Simulate authentication (replace with real auth later)
    appState.isAuthenticated = true;
    appState.user = { email };
    
    // Store in localStorage
    localStorage.setItem('shootingCoachAuth', JSON.stringify({ email }));
    
    showHomePage();
}

function handleSignup(event) {
    event.preventDefault();
    const name = document.getElementById('signupName').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    
    // Simulate authentication (replace with real auth later)
    appState.isAuthenticated = true;
    appState.user = { email, name };
    
    // Store in localStorage
    localStorage.setItem('shootingCoachAuth', JSON.stringify({ email, name }));
    
    showHomePage();
}

function showHomePage() {
    // Hide index page completely
    document.getElementById('indexPage').classList.remove('active');
    
    // Show navigation bar
    document.getElementById('navBar').style.display = 'flex';
    
    // Navigate to home page
    navigateTo('home');
    updateStats();
}

// Stats Functions
function updateStats() {
    // Load stats from localStorage
    const savedStats = localStorage.getItem('shootingCoachStats');
    if (savedStats) {
        appState.stats = JSON.parse(savedStats);
    }
    
    // Update UI
    document.getElementById('totalShots').textContent = appState.stats.totalShots;
    document.getElementById('accuracy').textContent = appState.stats.accuracy + '%';
    document.getElementById('avgSpeed').textContent = appState.stats.avgSpeed + '°/s';
    document.getElementById('comDeviation').textContent = appState.stats.comDeviation + 'cm';
}

function shareStats() {
    const shareText = `My Shooting Coach Stats:\nTotal Shots: ${appState.stats.totalShots}\nAccuracy: ${appState.stats.accuracy}%\nAvg Speed: ${appState.stats.avgSpeed}°/s`;
    
    if (navigator.share) {
        navigator.share({
            title: 'My Basketball Training Stats',
            text: shareText
        });
    } else {
        // Fallback - copy to clipboard
        navigator.clipboard.writeText(shareText);
        alert('Stats copied to clipboard!');
    }
}

// Training Page Integration
async function initializeTraining() {
    const container = document.getElementById('videoContainer');
    
    // Check if already initialized
    if (container.querySelector('video')) {
        return;
    }
    
    // Show loading with message
    container.innerHTML = `
        <div style="text-align: center; padding: 40px;">
            <div class="loading"></div>
            <p style="margin-top: 20px; color: #666;">Initializing camera...</p>
            <p style="margin-top: 10px; color: #999; font-size: 14px;">You may need to allow camera access</p>
        </div>
    `;
    
    // Load the training interface
    try {
        // Dynamically load MediaPipe and training scripts
        await loadTrainingScripts();
        
        // Initialize the training session
        if (window.initializeMediaPipeTraining) {
            window.initializeMediaPipeTraining(container, (shotData) => {
                // Callback when shot is detected
                updateShotStats(shotData);
            });
        }
    } catch (error) {
        console.error('Failed to initialize training:', error);
        container.innerHTML = '<p>Failed to load camera. Please check permissions.</p>';
    }
}

async function loadTrainingScripts() {
    // Load scripts if not already loaded
    if (!window.Pose) {
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js');
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js');
        await loadScript('./training-integration.js');
    }
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

function updateShotStats(shotData) {
    // Update stats
    appState.stats.totalShots++;
    
    // Update speed average
    if (shotData.velocity) {
        const prevTotal = appState.stats.avgSpeed * (appState.stats.totalShots - 1);
        appState.stats.avgSpeed = Math.round((prevTotal + shotData.velocity) / appState.stats.totalShots);
    }
    
    // Save stats
    localStorage.setItem('shootingCoachStats', JSON.stringify(appState.stats));
    
    // Save shot replay
    saveReplay(shotData);
    
    // Update heatmap
    updateHeatmap(shotData);
    
    // Update UI if on home page
    if (appState.currentPage === 'home') {
        updateStats();
    }
}

function saveReplay(shotData) {
    const replays = JSON.parse(localStorage.getItem('shootingCoachReplays') || '[]');
    replays.push({
        timestamp: Date.now(),
        duration: shotData.duration,
        velocity: shotData.velocity,
        video: shotData.videoBlob // Store video blob reference
    });
    
    // Keep only last 50 replays
    if (replays.length > 50) {
        replays.shift();
    }
    
    localStorage.setItem('shootingCoachReplays', JSON.stringify(replays));
}

function updateHeatmap(shotData) {
    // Update muscle group usage based on shot data
    // This is a simplified version - you'd need more complex biomechanics analysis
    const sections = ['forearm', 'upperarm', 'trunk', 'thigh', 'shin'];
    sections.forEach(section => {
        const current = appState.heatmapData[section] || 0;
        appState.heatmapData[section] = current + (Math.random() * 20); // Placeholder calculation
    });
    
    // Update heatmap visualization
    updateHeatmapVisualization();
}

function updateHeatmapVisualization() {
    const maxHeat = Math.max(...Object.values(appState.heatmapData), 1);
    
    Object.entries(appState.heatmapData).forEach(([section, heat]) => {
        const elements = document.querySelectorAll(`#section-${section}, #section-${section}2`);
        const intensity = heat / maxHeat;
        const opacity = 0.2 + (intensity * 0.6);
        
        elements.forEach(el => {
            el.style.fill = `rgba(255, 0, 0, ${opacity})`;
            el.style.stroke = '#1A1A1A';
        });
    });
}

// Initialize app on load
window.addEventListener('DOMContentLoaded', () => {
    // Always start at index page
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('indexPage').classList.add('active');
    document.getElementById('navBar').style.display = 'none';
    
    // Option 1: Always require login (current implementation)
    localStorage.removeItem('shootingCoachAuth');
    appState.isAuthenticated = false;
    appState.user = null;
    
    // Option 2: Keep user logged in but still show index first
    // Uncomment below and comment out Option 1 if you prefer this
    /*
    const savedAuth = localStorage.getItem('shootingCoachAuth');
    if (savedAuth) {
        appState.isAuthenticated = true;
        appState.user = JSON.parse(savedAuth);
        // User is logged in but still sees index page first
        // They can click login and will go straight to home
    }
    */
});

// Add logout function
function logout() {
    appState.isAuthenticated = false;
    appState.user = null;
    localStorage.removeItem('shootingCoachAuth');
    navigateTo('index');
}

// Handle login button from index page
function handleIndexLogin() {
    // If already logged in (from previous session), go straight to home
    if (appState.isAuthenticated) {
        showHomePage();
    } else {
        navigateTo('login');
    }
}