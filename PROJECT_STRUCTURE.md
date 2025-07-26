# 投篮教练 - 项目结构

## 📁 文件夹组织

```
shootingcoach/
├── assets/                 # 资源文件
│   ├── css/               # 样式文件
│   │   ├── styles.css     # 主样式
│   │   └── pwa-installer.css  # PWA安装引导样式
│   ├── icons/             # 所有图标文件
│   │   ├── android-chrome-192x192.png
│   │   ├── android-chrome-512x512.png
│   │   ├── apple-touch-icon.png
│   │   ├── favicon-16x16.png
│   │   ├── favicon-32x32.png
│   │   └── favicon.ico
│   └── js/                # JavaScript文件
│       ├── app-navigation.js     # 主应用逻辑
│       ├── batch-selection.js    # 批量选择功能
│       ├── camera-helper.js      # 摄像头辅助
│       ├── i18n.js              # 国际化
│       ├── pwa-camera-fix.js    # PWA摄像头修复
│       ├── pwa-installer.js     # PWA安装引导
│       ├── simple-auth.js       # 认证模块
│       ├── supabase-client.js   # Supabase客户端
│       └── supabase-config.js   # Supabase配置
├── docs/                  # 文档和测试文件
│   ├── app-debug.html     # 调试页面
│   ├── pwa-https-notice.html  # HTTPS提示页
│   └── test-supabase.html     # Supabase测试页
├── index.html             # 主页面
├── manifest.json          # PWA配置
├── service-worker.js      # Service Worker（必须在根目录）
├── .env                   # 环境变量（不提交到Git）
├── .env.example          # 环境变量示例
└── README.md             # 项目说明
```

## 🔧 配置说明

### PWA图标配置
- 所有图标都在 `assets/icons/` 文件夹中
- `manifest.json` 已配置所有必需的图标路径
- HTML中的favicon链接已更新

### 文件引用路径
- CSS: `/assets/css/`
- JS: `/assets/js/`
- Icons: `/assets/icons/`

### Service Worker缓存
Service Worker已更新为缓存新的文件路径结构。

## 📱 部署注意事项
1. Service Worker必须保留在根目录
2. 所有路径都是相对于根目录的绝对路径（以/开头）
3. HTTPS是PWA摄像头访问的必需条件

## 🚀 快速开始
```bash
# 本地测试
python3 -m http.server 8000

# 部署到Vercel
vercel
```