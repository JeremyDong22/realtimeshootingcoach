# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Shoot-It** is a Progressive Web App (PWA) for real-time basketball shooting analysis. It uses computer vision and AI to track shooting form, detect shots, and provide coaching feedback.

## Tech Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Computer Vision**: MediaPipe Holistic (pose tracking), YOLOv11 (basketball detection via ONNX)
- **Backend**: Supabase (authentication, database)
- **Deployment**: Vercel/Netlify, Docker support
- **PWA**: Service Worker, offline support, installable

## Development Principles

### No Mock Data Policy
- **严禁使用Mock Data**：所有环境（开发、测试、生产）必须连接真实Supabase实例
- **真实数据测试**：即使是开发环境，也必须使用真实的Supabase数据库连接
- **不允许硬编码测试数据**：所有数据必须来自真实数据库或IndexedDB

## Security Guidelines

- **Credential Management**:
  - We have Supabase credentials in the .env file and we always keep that in the .env file. Do not expose it to any of those JS files.

## Deployment Notes

- **Automatic Deployment**:
  - If we push our code to Github, it will automatically deploy to Vercel.  
- **Vercel Deployment Considerations**:
  - Always keep in mind that we are deploying to Vercel, not GitHub Pages
  - Look at the Vercel official documentation for potential deployment issues
  - Once we push changes to GitHub, commit the change, and Vercel will automatically deploy

## Key Commands

```bash
# Development
npm run dev         # Build config and start dev server on port 8000
npm run build       # Generate Supabase config from environment variables
npm run serve       # Start server without building

# Required Environment Variables (for build)
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Data Architecture

### Current Stage: MVP/Beta
- 持续到正式发布iOS应用或生产版本
- 采用混合存储策略优化用户体验

### Storage Strategy
1. **Supabase (云端)**
   - `sc_simple_users`表：存储用户认证信息
     - `email_or_phone`: 用户登录凭证
     - `password`: 用户密码（明文存储 - MVP阶段决策）
     - `full_name`: 用户姓名
     - `shooting_hand`: 惯用手设置
   
2. **IndexedDB (本地)**
   - 所有投篮记录和视频数据
   - 临时存储，未来版本将迁移至Supabase

### Note
- sc_shots, sc_user_stats等表已在Supabase中预留，但MVP阶段暂不使用

## Architecture

### Core Components

1. **Authentication Flow** (`assets/js/simple-auth.js`)
   - 使用Supabase `sc_simple_users`表进行用户认证
   - 密码明文存储（MVP阶段设计）
   - SessionStorage管理登录状态

2. **Shot Detection System** (`assets/js/app-navigation.js`)
   - Wrist angle tracking (passing through -90� vertical)
   - Angular velocity threshold (>300�/s)
   - U-shape trajectory detection for shot start
   - Debug video recording of detected shots

3. **Multi-language Support** (`assets/js/i18n.js`)
   - Chinese (default) and English
   - Dynamic UI translation via data-i18n attributes

4. **PWA Features**
   - Service Worker for offline caching (`service-worker.js`)
   - Install prompts (`assets/js/pwa-installer.js`)
   - Camera access handling

### File Structure

- `index.html` - Single page application with multiple views
- `assets/js/` - Modular JavaScript components
- `assets/css/styles.css` - Mobile-first responsive design
- `basketballModel.onnx` - YOLO model for basketball detection (must be present)
- `build.js` - Node script to inject environment variables

### Page Navigation

The app uses a single-page architecture with these views:
- **landing** - Login/signup
- **home** - Dashboard with stats
- **trainingSetup** - Mode selection (count/time/free)
- **trainingInstructions** - Setup guide
- **training** - Camera view with real-time tracking
- **replays** - Session history
- **profile** - User settings

## Development Notes

### Data Management
- 必须使用真实Supabase连接，禁止任何形式的mock data
- MVP阶段数据主要存储在IndexedDB，认证信息在Supabase

### Supabase Configuration
The app requires Supabase environment variables. The build script (`build.js`) generates `supabase-config.js` from the template using environment variables.

### Basketball Model
The ONNX model (`basketballModel.onnx`) must be present in the root directory for basketball detection to work.

### Camera Requirements
- HTTPS required for camera access (PWA requirement)
- MediaPipe requires good lighting and full body visibility
- Optimal distance: 2-3 meters from camera

### Deployment
- Vercel/Netlify: Set environment variables in dashboard
- Docker: Use provided Dockerfile and nginx.conf
- Always run `npm run build` before deployment

## Project Core Logic Preservation

- **MediaPipe and Core Algorithm Stability**:
  - Do not change anything of MediaPipe and the core algorithm until explicitly instructed
  - This is the core logic of the application
  - Any potential changes must be approached with extreme caution
  - Preserve the complexity of the model to maintain core functionality

## Development Tools

- **Debugging and Experimentation**:
  - We use the app-debug.js to debug and also use for experimenting with our new feature.

## Project Folder Insights

- **Experiment Folder**:
  - This is the place where we do the experiment and develop new features
  - More focused on the algorithm of kinesiology and biomechanics
  - The JavaScript file within it is usually referred to as the blueprint or the test for the actual app in @shot-detection.js