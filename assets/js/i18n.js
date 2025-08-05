/**
 * Multi-language support system
 * Supports Chinese (default) and English languages
 * Handles UI text translations and speech commands
 */

const translations = {
    zh: {
        // Landing page
        appTitle: "Shoot It",
        appSubtitle: "你的AI投篮教练",
        login: "登录",
        signup: "注册",
        yourName: "您的姓名",
        emailOrPhone: "邮箱或手机号",
        password: "密码",
        continueWithGoogle: "使用 Google 继续（即将推出）",
        passwordRequirements: "密码必须包含：",
        atLeast8Chars: "至少8个字符",
        oneUppercase: "一个大写字母",
        oneLowercase: "一个小写字母",
        oneNumber: "一个数字",
        oneSpecial: "一个特殊字符 (!@#$%^&*)",
        orContinueWith: "或使用以下方式继续",
        selectShootingHand: "选择投篮惯用手",
        
        // Dashboard
        dashboard: "控制面板",
        avgShootingSpeed: "平均投篮速度",
        totalShots: "总投篮数",
        shootingAccuracy: "投篮准确率",
        shotsPerWeek: "每周投篮",
        streak: "连续天数",
        recentShots: "最近投篮",
        seeAll: "查看全部",
        noShotsYet: "还没有投篮记录。开始训练吧！",
        
        // Training setup
        trainingSetup: "训练设置",
        chooseTrainingMode: "选择训练模式",
        shotCount: "投篮计数",
        completeShotsDesc: "完成指定数量的投篮",
        numberOfShots: "投篮次数",
        timeTrial: "计时挑战",
        shootManyDesc: "在限定时间内完成投篮",
        seconds: "秒",
        minute: "分钟",
        minutes: "分钟",
        freePractice: "自由练习",
        practiceNoLimits: "无限制练习",
        proMode: "专业模式",
        shootingStability: "投篮稳定性训练",
        stabilityDesc: "专注于躯干的稳定 每一次投篮尽可能保持一致 以及重心的微小变化",
        releaseSpeed: "出手速度训练",
        speedDesc: "用尽可能快的方式出手 同时保持命中率 专注于比赛时的对抗出手速度",
        powerEfficiency: "发力效率训练",
        efficiencyDesc: "以最高效的形式发力 专注于用最少的能量完成投篮",
        proModeNote: "* 专业模式将使用不同的算法进行分析（功能开发中）",
        selectTrainingMode: "选择训练模式",
        
        // Training instructions
        getReady: "准备就绪",
        importantInstructions: "重要说明",
        shootRightSide: "从惯用手同侧录像",
        shootLeftSide: "从惯用手同侧录像",
        shootRightDesc: "我们的AI追踪您的投篮手动作。确保投篮手的那一边对着摄像头可见。从侧面90度拍摄最佳。",
        shootLeftDesc: "我们的AI追踪您的投篮手动作。确保投篮手的那一边对着摄像头可见。从侧面90度拍摄最佳。",
        properDistance: "保持适当位置",
        properDistanceDesc: "使您的全身完全在摄像头的画面内，并且在头部留有空余为起跳后的手腕检测留足空间。",
        goodLighting: "良好照明",
        goodLightingDesc: "确保充足的照明以准确追踪动作。",
        stabilityTips: "稳定性训练要点",
        stabilityTip1: "• 尽可能保持投篮动作稳定",
        stabilityTip2: "• 重点关注重心的偏移和投篮前后的脚步落点",
        stabilityTip3: "• 尽可能保证投篮命中率",
        stabilityTip4: "• 根据实时语音反馈进行调整",
        stabilityNote: "本模式利用投篮前后的脚步落点衡量稳定性表现",
        mode: "模式：",
        target: "目标：",
        shots: "投篮",
        imReady: "我准备好了",
        
        // Training
        initializingCamera: "正在初始化摄像头...",
        analyzing: "分析中...",
        shots: "投篮",
        time: "时间",
        
        // Profile
        profile: "个人资料",
        elitePlayer: "精英球员",
        shareApp: "分享应用",
        language: "语言",
        chinese: "中文",
        english: "English",
        shootingHand: "投篮惯用手",
        rightHand: "右手",
        leftHand: "左手",
        logout: "退出登录",
        version: "Shoot It v2.0",
        poweredBy: "由 MediaPipe 提供支持",
        
        // Replays
        trainingSessions: "训练记录",
        sessionDetails: "训练详情",
        noSessionsYet: "还没有训练记录！",
        shot: "投篮",
        duration: "出手速度",
        totalTime: "总时间",
        avgDuration: "平均时长",
        shotSpeed: "出手速度",
        stabilityScore: "稳定分数",
        today: "今天",
        yesterday: "昨天",
        dateAndTime: "日期和时间",
        noReplaysYet: "还没有回放记录。完成训练后查看您的投篮！",
        errorLoadingReplays: "加载回放时出错",
        shotNumber: "投篮",
        detected: "检测到",
        made: "命中",
        missed: "未中",
        adjustStart: "调整起点",
        noShotsInSession: "此训练中没有投篮",
        failedToLoadShots: "加载投篮失败",
        errorLoadingVideo: "加载视频时出错",
        waitingDevelopment: "(待开发)",
        selectAll: "全选",
        cancel: "取消",
        delete: "删除",
        
        // Navigation
        home: "主页",
        train: "训练", 
        replays: "回放",
        
        // Speech commands
        speechCommands: {
            startRecording: "开始录制",
            stopRecording: "停止录制",
            countdownStart: "准备开始",
            countdown: ["三", "二", "一", "开始"],
            sessionComplete: "训练结束",
            shotDetected: "投篮",
            totalShots: "总共投篮",
            averageSpeed: "平均速度",
            seconds: "秒"
        },
        
        // Additional messages
        pleaseLogin: "请先登录",
        enterCredentials: "请输入邮箱/手机号和密码",
        authFailed: "认证失败。请重试。",
        userLimitReached: "抱歉，我们已达到1000人的用户上限。请稍后再试。",
        welcomeUser: "欢迎",
        youAreUser: "您是第",
        cameraError: "摄像头错误。请检查权限。",
        mediaPipeError: "错误：MediaPipe未加载",
        positionCamera: "请将您的右侧面向摄像头",
        holdPosition: "保持姿势...",
        readyStartShooting: "准备好了！开始投篮",
        timesUp: "时间到！做得很好！",
        freeMode: "自由练习模式"
    },
    
    en: {
        // Landing page
        appTitle: "Shoot It",
        appSubtitle: "Your AI Shooting Coach",
        login: "Log In",
        signup: "Sign Up",
        yourName: "Your name",
        emailOrPhone: "Email or phone number",
        password: "Password",
        continueWithGoogle: "Continue with Google (Coming Soon)",
        passwordRequirements: "Password must contain:",
        atLeast8Chars: "At least 8 characters",
        oneUppercase: "One uppercase letter",
        oneLowercase: "One lowercase letter",
        oneNumber: "One number",
        oneSpecial: "One special character (!@#$%^&*)",
        orContinueWith: "Or continue with",
        selectShootingHand: "Select Shooting Hand",
        
        // Dashboard
        dashboard: "Dashboard",
        avgShootingSpeed: "Average Shooting Speed",
        totalShots: "Total Shots",
        shootingAccuracy: "Shooting Accuracy",
        shotsPerWeek: "Shots/Week",
        streak: "Streak",
        recentShots: "Recent Shots",
        seeAll: "See All",
        noShotsYet: "No shots yet. Start training!",
        
        // Training setup
        trainingSetup: "Training Setup",
        chooseTrainingMode: "Choose Training Mode",
        shotCount: "Shot Count",
        completeShotsDesc: "Complete a specific number of shots",
        numberOfShots: "Number of shots",
        timeTrial: "Time Trial",
        shootManyDesc: "Complete shots within time limit",
        seconds: "seconds",
        minute: "minute",
        minutes: "minutes",
        freePractice: "Free Practice",
        practiceNoLimits: "Practice without limits",
        proMode: "Pro Mode",
        shootingStability: "Shooting Stability Training",
        stabilityDesc: "Focus on torso stability, maintain consistency on each shot, and minimize center of gravity changes",
        releaseSpeed: "Release Speed Training",
        speedDesc: "Release as fast as possible while maintaining accuracy, focus on game-speed contested shots",
        powerEfficiency: "Power Efficiency Training",
        efficiencyDesc: "Use the most efficient form to generate power, focus on completing shots with minimal energy",
        proModeNote: "* Pro mode will use different algorithms for analysis (in development)",
        selectTrainingMode: "Select Training Mode",
        
        // Training instructions
        getReady: "Get Ready",
        importantInstructions: "Important Instructions",
        shootRightSide: "Shoot from Your Shooting Side",
        shootLeftSide: "Shoot from Your Shooting Side",
        shootRightDesc: "Our AI tracks your shooting hand motion. Make sure your shooting side faces the camera. Best results from 90-degree side angle.",
        shootLeftDesc: "Our AI tracks your shooting hand motion. Make sure your shooting side faces the camera. Best results from 90-degree side angle.",
        properDistance: "Maintain Proper Position",
        properDistanceDesc: "Position yourself so your full body is visible in the camera frame, with extra space above your head for wrist detection when jumping.",
        goodLighting: "Good Lighting",
        goodLightingDesc: "Ensure adequate lighting for accurate motion tracking.",
        stabilityTips: "Stability Training Tips",
        stabilityTip1: "• Maintain stable shooting form",
        stabilityTip2: "• Focus on center of gravity shift and foot placement",
        stabilityTip3: "• Ensure shot accuracy",
        stabilityTip4: "• Adjust based on real-time voice feedback",
        stabilityNote: "This mode measures stability using foot placement before and after shots",
        mode: "Mode:",
        target: "Target:",
        shots: "shots",
        imReady: "I'm Ready",
        
        // Training
        initializingCamera: "Initializing camera...",
        analyzing: "Analyzing...",
        shots: "Shots",
        time: "Time",
        
        // Profile
        profile: "Profile",
        elitePlayer: "Elite Player",
        shareApp: "Share App",
        language: "Language",
        chinese: "中文",
        english: "English",
        shootingHand: "Shooting Hand",
        rightHand: "Right Hand",
        leftHand: "Left Hand",
        logout: "Log Out",
        version: "Shoot It v2.0",
        poweredBy: "Powered by MediaPipe",
        
        // Replays
        trainingSessions: "Training Sessions",
        sessionDetails: "Session Details",
        noSessionsYet: "No training sessions yet!",
        shot: "Shot",
        duration: "Duration",
        totalTime: "Total Time",
        avgDuration: "Avg Duration",
        shotSpeed: "Shot Speed",
        stabilityScore: "Stability Score",
        today: "Today",
        yesterday: "Yesterday",
        dateAndTime: "Date & Time",
        noReplaysYet: "No replays yet. Complete a training session to see your shots!",
        errorLoadingReplays: "Error loading replays",
        shotNumber: "Shot",
        detected: "Detected",
        made: "Made",
        missed: "Missed",
        adjustStart: "Adjust Start",
        noShotsInSession: "No shots in this session",
        failedToLoadShots: "Failed to load shots",
        errorLoadingVideo: "Error loading video",
        waitingDevelopment: "(In Development)",
        selectAll: "Select All",
        cancel: "Cancel",
        delete: "Delete",
        
        // Speech commands
        speechCommands: {
            startRecording: "Start recording",
            stopRecording: "Stop recording",
            countdownStart: "Get ready",
            countdown: ["Three", "Two", "One", "Go"],
            sessionComplete: "Session complete",
            shotDetected: "Shot",
            totalShots: "Total shots",
            averageSpeed: "Average speed",
            seconds: "seconds"
        },
        
        // Additional messages
        pleaseLogin: "Please log in first",
        enterCredentials: "Please enter both email/phone and password",
        authFailed: "Authentication failed. Please try again.",
        userLimitReached: "Sorry, we have reached our 1000 user limit. Please try again later.",
        welcomeUser: "Welcome",
        youAreUser: "You are user #",
        cameraError: "Camera error. Please check permissions.",
        mediaPipeError: "Error: MediaPipe not loaded",
        positionCamera: "Position your right side to the camera",
        holdPosition: "Hold position...",
        readyStartShooting: "Ready! Start shooting",
        timesUp: "Time's up! Great job!",
        freeMode: "Free Practice Mode"
    }
};

// Current language
let currentLanguage = localStorage.getItem('language') || 'zh';

// Get translation
function t(key) {
    const keys = key.split('.');
    let value = translations[currentLanguage];
    
    for (const k of keys) {
        value = value?.[k];
    }
    
    return value || key;
}

// Set language
function setLanguage(lang) {
    if (translations[lang]) {
        currentLanguage = lang;
        localStorage.setItem('language', lang);
        updateUILanguage();
        
        // Trigger language change event
        window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: lang } }));
    }
}

// Get current language
function getCurrentLanguage() {
    return currentLanguage;
}

// Update UI with current language
function updateUILanguage() {
    // Update all elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        element.textContent = t(key);
    });
    
    // Update all elements with data-i18n-placeholder attribute
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
        const key = element.getAttribute('data-i18n-placeholder');
        element.placeholder = t(key);
    });
}

// Speech synthesis with language support
function speak(text, lang = null) {
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang || (currentLanguage === 'zh' ? 'zh-CN' : 'en-US');
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        
        window.speechSynthesis.speak(utterance);
    }
}

// Get speech command
function getSpeechCommand(command) {
    return t(`speechCommands.${command}`);
}

// Export functions
export { t, setLanguage, getCurrentLanguage, updateUILanguage, speak, getSpeechCommand };