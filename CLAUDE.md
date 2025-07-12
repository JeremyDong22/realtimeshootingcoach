# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Real-time basketball shooting coach PWA using MediaPipe 3D pose detection for shot analysis. The app detects shooting motion, tracks performance metrics, and provides video replays with debug overlays.

## Development Commands

**Start development server:**
```bash
# Basic HTTP server
python -m http.server 8000 --bind localhost

# HTTPS required for camera access (needs cert.pem and key.pem)
python -m https.server 8000
```

**Convert YOLO model to ONNX:**
```python
from ultralytics import YOLO
model = YOLO('basketballModel.pt')
model.export(format='onnx', opset=12, simplify=True)
```

## Architecture

### Core Components

1. **PWA Structure**
   - `index.html` - Main app with SPA navigation (7 pages)
   - `app-navigation.js` - Page routing and state management
   - `service-worker.js` - Offline support and caching

2. **Shot Detection Engine**
   - `app.js` - MediaPipe integration and shot detection algorithm
   - `training-integration.js` - Bridge between PWA and MediaPipe
   - Uses MediaPipe Pose (not Holistic) for performance

3. **Detection Algorithm**
   - Tracks right wrist angle relative to index finger
   - Detects shot when: wrist above nose + angle passes -90° + velocity > 300°/s
   - Finds shot start by tracing back to wrist U-shape bottom (lowest Y position)
   - 3-second analysis window with 300ms padding for video recording

### State Management

- Simple `appState` object in `app-navigation.js`
- localStorage for persistence (stats, replays, user data)
- No external state management library

### Performance Optimizations

- MediaPipe Pose instead of Holistic (33 vs 543 landmarks)
- YOLO basketball detection disabled by default (< 1 FPS issue)
- Only right-hand tracking active
- Face landmarks filtered out from display

## Key Technical Decisions

1. **PWA over native app** - Faster deployment, no app store approval
2. **Vanilla JavaScript** - No framework dependencies, smaller bundle
3. **CDN dependencies** - MediaPipe loaded from CDN, no npm/bundler
4. **Client-side only** - No backend, all processing in browser
5. **Minimalist design** - Black/white theme with rounded corners

## Common Tasks

### Adding New Pages
1. Add page HTML to `index.html` with unique ID
2. Add navigation item to nav bar
3. Update `navigateTo()` function in `app-navigation.js`

### Modifying Shot Detection
- Core logic in `app.js` lines 300-400
- Adjust thresholds: `VELOCITY_THRESHOLD`, angle ranges
- U-shape detection in `findShotStart()` function

### Updating Stats
- Stats saved to localStorage as `shootingCoachStats`
- Update in `updateShotStats()` function
- Heatmap data in `updateHeatmap()`

## Camera Permissions

- Camera access is required for training mode
- HTTPS is required for camera access (use self-signed certs for local dev)
- Permission prompt will appear on first use
- Error handling in `training-integration.js` shows user-friendly messages
- Use `python -m https.server 8000` with cert.pem and key.pem files

## Debugging

- Debug panel shows real-time angle, velocity, detection state
- Console logs detailed shot analysis
- Debug videos saved with overlays showing all metrics
- Check browser console for MediaPipe initialization errors

## Recent Changes

- Switched from "above shoulder" to "above nose" detection
- Changed from deepest U-shape to nearest U-shape selection
- Added 300ms video padding before/after shots
- Removed basketball YOLO detection for performance