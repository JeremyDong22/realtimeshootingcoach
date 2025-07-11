# Real-time Shooting Coach

A web application for real-time basketball shooting analysis using MediaPipe 3D pose detection and YOLO basketball detection.

## Features
- Real-time pose tracking with MediaPipe Holistic
- Basketball detection using YOLOv11
- Shot detection based on wrist angle and velocity
- U-shape trajectory detection
- Debug video recording of shots
- Traceback analysis to find shot start point

## Technology Stack
- MediaPipe Holistic (Pose + Face landmarks)
- YOLOv11 (via ONNX Runtime Web)
- HTML5/CSS3/JavaScript
- MediaRecorder API for video capture

## Setup

### Converting Basketball Model to ONNX

To use the YOLO basketball detection, you need to convert your `basketballModel.pt` to ONNX format:

```python
import torch
from ultralytics import YOLO

# Load your trained model
model = YOLO('basketballModel.pt')

# Export to ONNX
model.export(format='onnx', opset=12, simplify=True)
```

This will create `basketballModel.onnx` which the web app can load.

### Running the App

1. Ensure you have `basketballModel.onnx` in the root directory
2. Serve the files with HTTPS (required for camera access):
   ```bash
   python -m http.server 8000 --bind localhost
   ```
3. Open https://localhost:8000 in your browser

## Shot Detection Algorithm

The system detects basketball shots using:
1. Wrist angle passing through -90° (vertical upward)
2. Angular velocity > 300°/s
3. Wrist above shoulder position

Shot start is determined by:
1. Basketball trajectory U-shape bottom (lowest Y point)
2. Wrist below shoulder at that moment