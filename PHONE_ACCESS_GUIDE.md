# 📱 Phone Access Guide for MediaPipe 3D Movement Analysis

## Current Status
✅ **HTTP Server Running**: The application is now serving on port 8080  
🔄 **Setting up tunneling for phone access**

## 🚀 Quick Access Methods

### Method 1: Direct Access (if on same network)
If your phone is on the same WiFi network as your development environment:
1. Find your local IP address by running: `hostname -I`
2. Open your phone's browser and navigate to: `http://[YOUR_IP]:8080`

### Method 2: Using ngrok (Recommended)
1. **Install ngrok** (already done ✅)
2. **Start tunnel**: `ngrok http 8080`
3. **Get public URL** from ngrok dashboard at: http://localhost:4040
4. **Access from phone**: Use the https://xxxxxxxx.ngrok.io URL

### Method 3: Manual Port Forwarding
If you have SSH access to your remote environment:
```bash
ssh -L 8080:localhost:8080 user@your-remote-server
```
Then access: http://localhost:8080 on your local machine

## 📋 Application Features

### 🎯 Tracking Modes
- **Pose Tracking**: Full body pose analysis with wrist velocity tracking
- **Hand Tracking**: Detailed finger movement analysis
- **Combined Mode**: Both pose and hand tracking simultaneously

### 📊 Real-time Analytics
- **3D Position Tracking**: X, Y, Z coordinates for all landmarks
- **Velocity Calculations**: Real-time speed measurements
- **Angular Velocity**: Rotational movement analysis
- **Movement Patterns**: Automatic pattern detection
- **Data Recording**: Export movement data as JSON

### 📱 Mobile Optimizations
- **Touch-friendly interface**: Large buttons and responsive design
- **Orientation support**: Works in portrait and landscape
- **Real-time performance**: Optimized for mobile browsers
- **Camera access**: Front and rear camera support

## 🎮 How to Use

### 1. Initial Setup
1. **Choose tracking mode**: Pose, Hand, or Combined
2. **Allow camera access** when prompted
3. **Start Camera** to begin tracking

### 2. Movement Analysis
- **Position yourself** in front of the camera
- **Move your hands/body** to see real-time tracking
- **Monitor velocity** and movement data in the panels
- **Switch modes** to analyze different movements

### 3. Data Recording
1. **Click "Record Data"** to start recording
2. **Perform movements** you want to analyze
3. **Stop recording** to save data
4. **Download JSON file** with all movement data

## 🛠️ Technical Specifications

### Supported Movements
- **Wrist Tracking**: 3D position and velocity
- **Finger Tracking**: Index finger tip movement
- **Angular Velocity**: Rotation measurements
- **Depth Movement**: Z-axis displacement
- **Overall Activity**: Combined movement metrics

### Performance Metrics
- **Real-time FPS**: Frames per second display
- **Memory Usage**: Performance monitoring
- **Maximum Velocity**: Peak speed tracking
- **Movement Patterns**: Activity classification

### Browser Requirements
- **WebRTC Support**: For camera access
- **Canvas Support**: For real-time rendering
- **JavaScript ES6+**: Modern browser features
- **HTTPS Required**: For camera permissions on mobile

## 🔧 Troubleshooting

### Camera Issues
- **Grant permissions**: Allow camera access in browser
- **Check privacy settings**: Ensure camera isn't blocked
- **Try different browsers**: Chrome/Safari work best
- **Clear browser cache**: If experiencing issues

### Performance Issues
- **Close other apps**: Free up mobile resources
- **Use WiFi**: Better connectivity than mobile data
- **Good lighting**: Improves tracking accuracy
- **Stable positioning**: Reduce camera shake

### Connection Issues
- **Check network**: Ensure stable internet connection
- **Refresh page**: If application stops responding
- **Clear cache**: Browser cache can cause issues
- **Try incognito mode**: Eliminates extension conflicts

## 📈 Data Export Format

When you record movement data, it exports as JSON with this structure:
```json
{
  "timestamp": "ISO timestamp",
  "landmarks": "MediaPipe landmark coordinates",
  "velocities": {
    "leftWrist": "velocity in units/second",
    "rightWrist": "velocity in units/second",
    "leftIndex": "finger velocity",
    "rightIndex": "finger velocity"
  }
}
```

## 🎯 Use Cases

### Sports Analysis
- **Basketball shooting**: Wrist velocity and form analysis
- **Tennis serves**: Angular velocity measurement
- **Golf swings**: Movement pattern tracking
- **General athletics**: Performance optimization

### Physical Therapy
- **Range of motion**: Movement tracking
- **Recovery progress**: Velocity improvements
- **Exercise compliance**: Movement verification
- **Rehabilitation**: Progress monitoring

### Gesture Recognition
- **Sign language**: Hand movement analysis
- **Interface control**: Gesture-based interaction
- **Communication**: Movement-based messaging
- **Accessibility**: Alternative input methods

## 🔗 Next Steps

1. **Test the application** on your phone using one of the access methods above
2. **Experiment with different tracking modes** to see what works best for your use case
3. **Record some sample movements** to test the data export functionality
4. **Adjust camera positioning** for optimal tracking results

## 📞 Support

If you encounter any issues:
1. Check the browser console for error messages
2. Ensure camera permissions are granted
3. Try refreshing the page
4. Test with different browsers
5. Check network connectivity

---
**Created**: MediaPipe 3D Human Movement Analysis System  
**Version**: 1.0  
**Compatible**: Mobile browsers with WebRTC support