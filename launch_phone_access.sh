#!/bin/bash

echo "🚀 MediaPipe 3D Movement Analysis - Phone Access Setup"
echo "=================================================="

# Check if HTTP server is running
if pgrep -f "python3 -m http.server 8080" > /dev/null; then
    echo "✅ HTTP Server already running on port 8080"
else
    echo "🔄 Starting HTTP server on port 8080..."
    python3 -m http.server 8080 &
    sleep 2
    echo "✅ HTTP Server started"
fi

echo ""
echo "📱 PHONE ACCESS OPTIONS:"
echo "========================"

echo ""
echo "🌐 Option 1: Using ngrok (Recommended)"
echo "--------------------------------------"
echo "Run this command in a new terminal:"
echo "   ngrok http 8080"
echo ""
echo "Then look for a line like:"
echo "   Forwarding https://xxxx-xxxx-xx.ngrok.io -> http://localhost:8080"
echo ""
echo "🎯 Use that HTTPS URL on your phone!"

echo ""
echo "🏠 Option 2: Local Network Access"
echo "--------------------------------"
LOCAL_IP=$(hostname -I | awk '{print $1}')
echo "Your local IP: $LOCAL_IP"
echo "Try on your phone: http://$LOCAL_IP:8080"
echo "(Only works if your phone is on the same WiFi network)"

echo ""
echo "🛠️ Option 3: Alternative Tunneling"
echo "----------------------------------"
echo "If ngrok doesn't work, try these alternatives:"
echo ""
echo "localtunnel:"
echo "   npx localtunnel --port 8080"
echo ""
echo "serveo:"
echo "   ssh -R 80:localhost:8080 serveo.net"

echo ""
echo "🎮 APPLICATION FEATURES:"
echo "========================"
echo "✅ Real-time 3D pose tracking"
echo "✅ Hand and finger movement analysis"  
echo "✅ Velocity and angular speed calculations"
echo "✅ Movement pattern detection"
echo "✅ Data recording and export"
echo "✅ Mobile-optimized interface"

echo ""
echo "📱 MOBILE USAGE TIPS:"
echo "===================="
echo "• Allow camera permissions when prompted"
echo "• Use good lighting for best tracking"
echo "• Try both front and rear cameras"
echo "• Switch between Pose, Hand, and Combined modes"
echo "• Use Record Data to capture movements"

echo ""
echo "🔧 TROUBLESHOOTING:"
echo "=================="
echo "• If camera doesn't work, try refreshing the page"
echo "• Chrome and Safari work best on mobile"
echo "• Clear browser cache if experiencing issues"
echo "• Ensure stable WiFi connection"

echo ""
echo "🎯 Ready to use! Get the public URL and access from your phone!"
echo "================================================================"