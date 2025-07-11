// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => console.log('ServiceWorker registered'))
            .catch(err => console.log('ServiceWorker registration failed: ', err));
    });
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
        
        // Special handling for training page
        if (page === 'training') {
            initializeTraining();
        }
    }
}

// Auth Functions
function showAuth(type) {
    const modal = document.getElementById('authModal');
    const title = document.getElementById('authTitle');
    title.textContent = type === 'login' ? 'Log In' : 'Sign Up';
    modal.classList.add('active');
}

function closeAuth() {
    document.getElementById('authModal').classList.remove('active');
}

function handleAuth(event) {
    event.preventDefault();
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    
    // Simulate authentication (replace with real auth later)
    appState.isAuthenticated = true;
    appState.user = { email };
    
    // Store in localStorage
    localStorage.setItem('shootingCoachAuth', JSON.stringify({ email }));
    
    closeAuth();
    showHomePage();
}

function showHomePage() {
    document.getElementById('navBar').style.display = 'flex';
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
    
    // Create loading indicator
    container.innerHTML = '<div class="loading"></div>';
    
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
        await loadScript('training-integration.js');
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

// Check for existing auth on load
window.addEventListener('DOMContentLoaded', () => {
    const savedAuth = localStorage.getItem('shootingCoachAuth');
    if (savedAuth) {
        appState.isAuthenticated = true;
        appState.user = JSON.parse(savedAuth);
        showHomePage();
    }
});

// Close modal on outside click
window.addEventListener('click', (event) => {
    const modal = document.getElementById('authModal');
    if (event.target === modal) {
        closeAuth();
    }
});