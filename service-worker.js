// Service Worker - Version 7.0
// Fixed IndexedDB usage for stats and shots
const CACHE_NAME = 'shooting-coach-v7-fixed';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/css/styles.css',
  '/assets/css/pwa-installer.css',
  '/assets/icons/android-chrome-192x192.png',
  '/assets/icons/android-chrome-512x512.png',
  '/assets/icons/apple-touch-icon.png',
  '/assets/icons/favicon.ico'
];

// DO NOT CACHE JavaScript files or media streams
const NO_CACHE_PATTERNS = [
  /\.js$/,
  /\.js\?/,
  /app-navigation/,
  /simple-auth/,
  /supabase/,
  /pwa-utils/,
  /mediaDevices/,
  /getUserMedia/
];

// Install event - cache resources
self.addEventListener('install', event => {
  console.log('Service Worker v7.0 installing...');
  // Skip waiting to activate immediately
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache v7.0');
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch event - Network first for JS files
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Check if this is a JS file or API call
  const shouldNotCache = NO_CACHE_PATTERNS.some(pattern => pattern.test(url.pathname));
  
  if (shouldNotCache) {
    // Always fetch from network for JS files
    event.respondWith(
      fetch(event.request).catch(() => {
        // If network fails, try cache as fallback
        return caches.match(event.request);
      })
    );
  } else {
    // Cache first for other resources
    event.respondWith(
      caches.match(event.request)
        .then(response => {
          if (response) {
            return response;
          }
          return fetch(event.request);
        })
    );
  }
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('Service Worker v7.0 activating...');
  const cacheWhitelist = [CACHE_NAME];
  
  event.waitUntil(
    Promise.all([
      // Take control immediately
      self.clients.claim(),
      // Delete old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheWhitelist.indexOf(cacheName) === -1) {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
    ])
  );
});