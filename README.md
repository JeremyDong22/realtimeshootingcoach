# MediaPipe 3D Human Movement Analysis

A comprehensive real-time human movement analysis application using MediaPipe 3D pose and hand tracking with advanced velocity calculations.

## 🚀 **APPLICATION IS NOW RUNNING!**

### 📱 **Access from Your Phone**

**HTTP Server Status**: ✅ **RUNNING** on port 8080

#### **Option 1: Try ngrok (Public Access)**
1. Run this command in your terminal:
   ```bash
   ngrok http 8080
   ```
2. Look for a line like: `Forwarding https://xxxx-xx-xx-xx-xx.ngrok.io -> http://localhost:8080`
3. **Use the https://xxxx-xx-xx-xx-xx.ngrok.io URL on your phone**

#### **Option 2: Direct Network Access**
- **Local IP**: `172.17.0.2`
- **Try accessing**: `http://172.17.0.2:8080` on your phone (if on same network)

#### **Option 3: Alternative Tunneling**
If ngrok doesn't work, try these alternatives:
- **localtunnel**: `npx localtunnel --port 8080`
- **serveo**: `ssh -R 80:localhost:8080 serveo.net`

## 🎯 Features

### **Real-time 3D Movement Tracking**
- **Pose Tracking**: Full body pose analysis with joint velocity
- **Hand Tracking**: Detailed finger movement and gesture analysis  
- **Combined Mode**: Simultaneous pose and hand tracking
- **3D Coordinates**: X, Y, Z position tracking for all landmarks

### **Advanced Velocity Analysis**
- **Linear Velocity**: Real-time speed calculations for wrists and fingers
- **Angular Velocity**: Rotational movement measurements
- **Peak Velocity Tracking**: Maximum speed recording
- **Movement Patterns**: Automatic activity classification

### **Mobile-Optimized Interface**
- **Responsive Design**: Works perfectly on phones and tablets
- **Touch Controls**: Large, touch-friendly buttons
- **Orientation Support**: Portrait and landscape modes
- **Real-time Performance**: Optimized for mobile browsers

### **Data Recording & Export**
- **Real-time Recording**: Capture movement data as JSON
- **Velocity History**: Track speed changes over time
- **Export Functionality**: Download analysis data
- **Performance Metrics**: FPS and memory usage monitoring

## 🎮 How to Use

### **1. Choose Tracking Mode**
- **Pose Tracking**: Analyze full body movement
- **Hand Tracking**: Focus on finger and hand movements
- **Combined**: Track both pose and hands simultaneously

### **2. Camera Setup**
1. Click **"Start Camera"**
2. Allow camera permissions when prompted
3. Position yourself in frame
4. Ensure good lighting for best tracking

### **3. Movement Analysis**
- **Real-time Feedback**: See your movement tracked live
- **Velocity Display**: Watch speed measurements update
- **3D Visualization**: View movement trails and patterns
- **Performance Monitoring**: Check FPS and system performance

### **4. Data Recording**
1. Click **"Record Data"** to start capturing
2. Perform the movements you want to analyze
3. Click **"Stop Recording"** when done
4. Download the JSON file with all movement data

## 🛠️ Technical Specifications

### **Tracking Capabilities**
- **33 Pose Landmarks**: Full body skeleton tracking
- **21 Hand Landmarks per hand**: Detailed finger analysis
- **Real-time 3D Coordinates**: X, Y, Z position data
- **Velocity Calculations**: Speed and acceleration metrics

### **Performance Metrics**
- **Frame Rate**: Real-time FPS display
- **Memory Usage**: Performance monitoring
- **Velocity Tracking**: Units per second measurements
- **Pattern Recognition**: Movement classification

### **Browser Support**
- **Chrome/Safari**: Recommended for best performance
- **WebRTC Required**: For camera access
- **HTTPS Needed**: For mobile camera permissions
- **Modern JavaScript**: ES6+ features required

## 📊 Data Output Format

The application exports movement data in JSON format:

```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "landmarks": {
    "pose": [...],
    "leftHand": [...],
    "rightHand": [...]
  },
  "velocities": {
    "leftWrist": 1.23,
    "rightWrist": 0.87,
    "leftIndex": 2.45,
    "rightIndex": 1.67
  },
  "angularVelocity": 15.3,
  "overallMovement": 0.0156
}
```

## 🎯 Use Cases

### **Sports Analysis**
- **Basketball**: Shooting form and wrist velocity analysis
- **Tennis**: Serve motion and racquet speed tracking
- **Golf**: Swing analysis and club head velocity
- **General Athletics**: Movement efficiency optimization

### **Physical Therapy**
- **Range of Motion**: Joint movement tracking
- **Recovery Progress**: Velocity improvement monitoring
- **Exercise Compliance**: Movement verification
- **Rehabilitation**: Progress tracking and analysis

### **Research & Development**
- **Gesture Recognition**: Hand movement analysis
- **Human-Computer Interaction**: Interface control via gestures
- **Biomechanics Research**: Movement pattern studies
- **Accessibility Applications**: Alternative input methods

## 🔧 Troubleshooting

### **Camera Issues**
- Grant camera permissions in browser settings
- Try different browsers (Chrome works best)
- Check if camera is being used by other applications
- Refresh the page if camera stops working

### **Performance Issues**
- Close other applications to free up resources
- Use a stable WiFi connection
- Ensure good lighting conditions
- Try reducing browser tabs/windows

### **Connection Issues**
- Check network connectivity
- Clear browser cache and cookies
- Try incognito/private browsing mode
- Restart the application if needed

## 📱 Mobile Access Steps

1. **Ensure the HTTP server is running** (port 8080)
2. **Get a public URL** using ngrok or alternatives
3. **Open the URL on your phone** browser
4. **Allow camera permissions** when prompted
5. **Start tracking** and enjoy real-time analysis!

---

**Built with**: MediaPipe, HTML5 Canvas, JavaScript ES6+  
**Compatible**: Modern mobile browsers with WebRTC support  
**Performance**: Real-time tracking at 30+ FPS on mobile devices