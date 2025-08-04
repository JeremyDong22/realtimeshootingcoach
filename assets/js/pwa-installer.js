// PWA installation guide and WeChat detection
// Updated: 2025-07-26 - Add WeChat detection and install prompts

class PWAInstaller {
  constructor() {
    this.deferredPrompt = null;
    this.isWeChat = this.detectWeChat();
    this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    this.isAndroid = /Android/.test(navigator.userAgent);
    this.isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || 
                              window.navigator.standalone === true;
    
    this.init();
  }

  detectWeChat() {
    return /MicroMessenger/i.test(navigator.userAgent);
  }

  init() {
    // Show WeChat prompt immediately if in WeChat
    if (this.isWeChat) {
      this.showWeChatPrompt();
      return;
    }

    // Listen for PWA install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.showInstallButton();
    });

    // Check if should show install instructions
    if (!this.isInStandaloneMode) {
      this.showInstallInstructions();
    }
  }

  showWeChatPrompt() {
    const prompt = document.createElement('div');
    prompt.className = 'wechat-prompt';
    prompt.innerHTML = `
      <div class="wechat-overlay"></div>
      <div class="wechat-content">
        <div class="arrow-up"></div>
        <h3>请在浏览器中打开</h3>
        <p>点击右上角 ⋯ 菜单</p>
        <p>选择 <strong>在浏览器中打开</strong></p>
        <button onclick="document.querySelector('.wechat-prompt').remove()">我知道了</button>
      </div>
    `;
    document.body.appendChild(prompt);
  }

  showInstallInstructions() {
    // Wait 3 seconds before showing
    setTimeout(() => {
      if (this.isIOS) {
        this.showIOSInstructions();
      } else if (this.isAndroid && !this.deferredPrompt) {
        this.showAndroidInstructions();
      }
    }, 3000);
  }

  showIOSInstructions() {
    const instructions = document.createElement('div');
    instructions.className = 'install-instructions ios-instructions';
    instructions.innerHTML = `
      <div class="install-card">
        <button class="close-btn" onclick="this.parentElement.parentElement.remove()">×</button>
        <h3>安装到主屏幕</h3>
        <div class="steps">
          <p>1. 点击底部 <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Cpath d='M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8'/%3E%3Cpolyline points='16 6 12 2 8 6'/%3E%3Cline x1='12' y1='2' x2='12' y2='15'/%3E%3C/svg%3E" alt="分享"> 分享按钮</p>
          <p>2. 滑动并选择 <strong>添加到主屏幕</strong></p>
          <p>3. 点击 <strong>添加</strong></p>
        </div>
      </div>
    `;
    document.body.appendChild(instructions);
  }

  showAndroidInstructions() {
    const instructions = document.createElement('div');
    instructions.className = 'install-instructions android-instructions';
    instructions.innerHTML = `
      <div class="install-card">
        <button class="close-btn" onclick="this.parentElement.parentElement.remove()">×</button>
        <h3>安装到主屏幕</h3>
        <div class="steps">
          <p>1. 点击右上角 ⋮ 菜单</p>
          <p>2. 选择 <strong>添加到主屏幕</strong></p>
          <p>3. 点击 <strong>添加</strong></p>
        </div>
      </div>
    `;
    document.body.appendChild(instructions);
  }

  showInstallButton() {
    const button = document.createElement('button');
    button.className = 'pwa-install-button';
    button.textContent = '安装应用';
    button.onclick = () => this.promptInstall();
    document.body.appendChild(button);
  }

  async promptInstall() {
    if (!this.deferredPrompt) return;
    
    this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    }
    
    this.deferredPrompt = null;
    document.querySelector('.pwa-install-button')?.remove();
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new PWAInstaller());
} else {
  new PWAInstaller();
}