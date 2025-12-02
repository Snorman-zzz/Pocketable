# Pocketable - VibeCode Clone

AI-powered mobile app builder using Claude Sonnet 4.5 and GPT-5.

## Architecture

- **Mobile** (PRIMARY): React Native + Expo app with chat interface and live preview
- **Backend**: Node.js + Express + Socket.io with dual AI SDK support
- **Web** (SECONDARY): Next.js companion app (coming soon)

## Features Implemented ✅

### Core Features
- ✅ Mobile app with Lovable-inspired design (black, minimalist)
- ✅ Model picker: Claude Sonnet 4.5 | GPT-5
- ✅ Mode switcher: Auto | Plan | Build
- ✅ Real-time chat with AI streaming responses
- ✅ WebSocket connection between mobile and backend
- ✅ Claude Agent SDK integration with Pocketable system prompt
- ✅ OpenAI Codex SDK integration
- ✅ SDK abstraction layer for model routing

### Preview & Code Generation
- ✅ **In-app preview with Expo Snack integration**
- ✅ **Automatic code extraction and preview generation**
- ✅ **Platform toggle (iOS/Android/Web) in preview**
- ✅ **Share preview URLs**

### Multimodal Input
- ✅ **Voice input with OpenAI Whisper transcription**
- ✅ **Image upload with AI vision analysis (Claude/GPT)**
- ✅ **Hands-free app building with voice commands**

### Project Management
- ✅ **Supabase integration for project persistence**
- ✅ **Projects screen with CRUD operations**
- ✅ **Create, open, share, and delete projects**
- ✅ **Project files storage**

### Export & Sharing
- ✅ **Share Snack preview URLs**
- ✅ **Copy code snippets to clipboard (long-press messages)**
- ✅ **Export conversation history as text file**
- ✅ **Share projects with others**
- ✅ **Open preview in browser**

### Settings & Documentation
- ✅ **Settings screen with comprehensive About AI documentation**
- ✅ **In-app feature guide and tips**
- ✅ **Technical details and version info**

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Expo CLI: `npm install -g expo-cli`
- iOS Simulator or Android Emulator (or Expo Go app on physical device)

### Environment Setup

#### 1. Backend Environment Variables

Create `backend/.env`:
```env
# Required for Claude Sonnet 4.5
ANTHROPIC_API_KEY=sk-ant-api03-...

# Required for GPT-5, Whisper transcription, and GPT Vision
OPENAI_API_KEY=sk-...

# Server configuration
PORT=3000

# Supabase (for project storage and persistence)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

**Note:**
- `ANTHROPIC_API_KEY` is **required** for Claude Sonnet 4.5 functionality
- `OPENAI_API_KEY` is **required** for:
  - GPT-5 model
  - Voice transcription (Whisper API)
  - Image analysis (GPT Vision)
- Supabase credentials are **optional** but recommended for project persistence

#### 2. Supabase Setup (Optional but Recommended)

If you want to save and manage projects:

1. **Create a Supabase Project**
   - Go to [supabase.com](https://supabase.com)
   - Create a new project
   - Copy the project URL and anon key to `.env`

2. **Run the Database Schema**
   - Open the Supabase SQL Editor
   - Copy and run `backend/src/config/supabase-schema.sql`
   - This creates the `projects` and `project_files` tables

3. **Verify Setup**
   - Start the backend server
   - Check the health endpoint: `curl http://localhost:3000/health`
   - You should see `"supabase": "connected"`

**Without Supabase:** The app will work for single sessions, but projects won't be saved between app restarts.

### Running the Application

#### 1. Start Backend Server

```bash
cd backend
npm run dev
```

You should see:
```
🚀 Backend server running on port 3000
📡 WebSocket server ready for connections
🔑 Claude API Key: ✓ Set
🔑 OpenAI API Key: ✗ Missing (if not set)
```

#### 2. Start Mobile App

In a new terminal:

```bash
cd mobile
npm start
```

Then:
- Press `i` for iOS Simulator
- Press `a` for Android Emulator
- Scan QR code with Expo Go app on physical device

### Testing the Chat & Preview

1. Open the mobile app
2. You'll see model picker (Claude Sonnet 4.5 | GPT-5) and mode picker (Auto | Plan | Build)
3. **Type or speak** your app idea:
   - **Text:** "Create a simple todo list app with React Native"
   - **Voice:** Tap 🎤, speak your idea, tap ⏹ to stop - it will auto-transcribe!
   - **Image:** Tap 📷 to upload an image for UI inspiration
4. Watch the AI stream the response in real-time!
5. When the AI generates code, a "👁 Preview" button will appear
6. Tap Preview to see your generated app running in real-time!
7. Toggle between iOS, Android, and Web platforms in the preview

#### Voice Input
- Tap the **🎤 microphone button** to start recording
- Speak your app idea naturally
- Tap **⏹ stop button** when done
- Wait for transcription (uses OpenAI Whisper)
- Edit the transcribed text if needed
- Send to AI!

#### Image Upload
- Tap the **📷 camera button**
- Select an image from your gallery
- AI will analyze it and describe how it could be used in an app
- The description is added to your message
- Great for UI inspiration, logos, icons, etc!

#### Test Snack Endpoint

You can test the Snack creation independently:
```bash
curl http://localhost:3000/test-snack
```

This will create a demo Snack and return the URL.

## Project Structure

```
pocketable/
├── mobile/                 # React Native + Expo (PRIMARY)
│   ├── app/               # Expo Router screens
│   │   ├── (tabs)/
│   │   │   ├── index.tsx      # Chat screen with AI
│   │   │   ├── projects.tsx   # Projects management
│   │   │   ├── settings.tsx   # Settings & About
│   │   │   └── _layout.tsx    # Tab navigation
│   │   ├── preview.tsx        # Full-screen preview
│   │   └── _layout.tsx
│   └── src/
│       ├── components/        # UI components
│       │   ├── ChatMessage.tsx
│       │   ├── ChatInput.tsx
│       │   ├── ModelPicker.tsx
│       │   └── ModePicker.tsx
│       ├── stores/            # Zustand state management
│       │   ├── useChatStore.ts
│       │   └── useProjectStore.ts
│       ├── services/          # API & utilities
│       │   ├── api.ts         # WebSocket client
│       │   ├── voice.ts       # Voice recording
│       │   ├── image.ts       # Image picker
│       │   ├── projects.ts    # Projects API
│       │   └── export.ts      # Export & sharing
│       └── theme/             # Design system
│           ├── colors.ts
│           ├── typography.ts
│           └── spacing.ts
│
├── backend/               # Node.js backend
│   └── src/
│       ├── agents/            # AI SDK adapters
│       │   ├── types.ts
│       │   ├── claude-adapter.ts
│       │   ├── codex-adapter.ts
│       │   └── agent-factory.ts
│       ├── config/
│       │   ├── pocketable-prompt.ts  # Pocketable system prompt
│       │   ├── models.ts             # Model configs
│       │   └── supabase-schema.sql   # Database schema
│       ├── routes/
│       │   ├── media.ts       # Voice & image APIs
│       │   └── projects.ts    # Project CRUD
│       ├── services/
│       │   └── supabase.ts    # Supabase client
│       ├── tools/
│       │   └── snack-api.ts   # Expo Snack creation
│       └── server.ts          # Main server
│
└── web/                   # Next.js (coming soon)
```

## Usage Guide

### Chat with AI
1. Select your AI model (Claude Sonnet 4.5 or GPT-5)
2. Choose a mode (Auto, Plan, or Build)
3. Type, speak, or upload an image to describe your app
4. Watch the AI generate your app in real-time
5. Tap "👁 Preview" to see your app running

### Managing Projects
1. Tap the **Projects** tab
2. Tap **+ Create Project** to start a new project
3. Long-press a project to see options:
   - **Open Project** - Load it in chat
   - **Share** - Share the Snack preview URL
   - **Delete** - Remove the project
4. Pull down to refresh the project list

### Export & Share
- **Long-press chat messages** to copy text or code
- **Tap ⋯ menu** in chat to:
  - Export conversation as text file
  - Share preview URL
  - Clear chat history
- **Tap ↗ button** in preview to share the Snack URL
- **Tap "Open in browser"** to view the preview on web

### Settings
- Tap the **Settings** tab to view:
  - How Pocketable works
  - Operating modes explained
  - Features list
  - Tips for best results
  - Technical details

## Next Steps (TODO)

### Completed ✅
- [x] ~~In-app preview with WebView + Expo Snack~~ ✅
- [x] ~~Automatic code extraction and Snack generation~~ ✅
- [x] ~~Voice input with expo-av (for hands-free coding)~~ ✅
- [x] ~~Image upload for custom assets (icons, logos)~~ ✅
- [x] ~~OpenAI Whisper transcription integration~~ ✅
- [x] ~~AI vision analysis (Claude/GPT) for images~~ ✅
- [x] ~~Project management with Supabase (save/load projects)~~ ✅
- [x] ~~Export and sharing functionality (download files, share links)~~ ✅
- [x] ~~Settings with About AI documentation (Pocketable spec)~~ ✅

### Remaining
- [ ] Web companion app with QR codes
- [ ] QR code generation for Expo Go testing
- [ ] Improved code extraction (multi-file support)
- [ ] Error boundaries and retry logic
- [ ] Rate limiting and cost management
- [ ] User authentication with Supabase Auth
- [ ] Unit tests for critical components
- [ ] E2E tests with Detox
- [ ] Production deployment (Expo EAS Build)

## Tech Stack

**Mobile:**
- React Native 0.81
- Expo SDK 54
- Expo Router (file-based navigation)
- TypeScript
- Zustand (state management)
- Socket.io Client (WebSocket)
- react-native-webview (preview)
- react-native-markdown-display (chat)
- expo-av (voice recording)
- expo-image-picker (image upload)
- expo-file-system (file operations)
- expo-sharing (share files)
- expo-clipboard (copy/paste)

**Backend:**
- Node.js + Express
- TypeScript
- Socket.io (WebSocket server)
- Claude Agent SDK (@anthropic-ai/claude-agent-sdk)
- OpenAI Codex SDK (@openai/codex-sdk)
- Supabase (PostgreSQL database)
- Axios (HTTP client)
- FormData (file uploads)

**Design:**
- Lovable-inspired minimalist aesthetic
- Black background (#0F0F0F)
- Purple accent (#8B5CF6) for brand
- High contrast, clean typography

## License

MIT
