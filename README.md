# Pocketable

**AI-Powered Mobile App Builder** - Build React Native apps through voice, text, or images using advanced AI models.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React Native](https://img.shields.io/badge/React%20Native-0.81-blue.svg)
![Expo](https://img.shields.io/badge/Expo-SDK%2054-000020.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)

## Overview

Pocketable is a mobile-first development platform that enables developers to create React Native applications using natural language, voice commands, and visual inputs. Powered by cutting-edge AI models (Claude Sonnet 4.5 and GPT-5), it provides real-time code generation, live preview, and multimodal interaction.

### Key Features

- **Dual AI Models** - Switch between Claude Sonnet 4.5 and GPT-5
- **Multimodal Input** - Text, voice, and image-based interactions
- **Live Preview** - Real-time app preview via Expo Snack integration
- **Project Management** - Save, load, and share projects with Supabase
- **Real-time Streaming** - WebSocket-based AI response streaming
- **Export & Share** - Export conversations and share preview URLs

## Quick Start

### Prerequisites

- Node.js 18 or higher
- npm or yarn
- Expo CLI: `npm install -g expo-cli`
- iOS Simulator or Android Emulator (or Expo Go app)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/Snorman-zzz/Pocketable.git
cd Pocketable
```

2. **Set up Backend**
```bash
cd pocketable/backend
npm install
```

Create `.env` file in `backend/`:
```env
# Required API Keys
ANTHROPIC_API_KEY=sk-ant-api03-...
OPENAI_API_KEY=sk-...

# Server Configuration
PORT=3001

# Optional: Supabase (for project persistence)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

3. **Set up Mobile App**
```bash
cd ../mobile
npm install
```

4. **Run the Application**

Start backend (in `pocketable/backend/`):
```bash
npm run dev
```

Start mobile app (in `pocketable/mobile/`):
```bash
npm start
```

Then press `i` for iOS or `a` for Android.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Mobile App                          │
│              (React Native + Expo)                      │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │     Chat     │  │   Projects   │  │   Preview    │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────┘
                         │
                   WebSocket (Socket.io)
                         │
┌─────────────────────────────────────────────────────────┐
│                 Backend Server                          │
│              (Node.js + Express)                        │
│                                                         │
│              ┌──────────────────┐                       │
│              │  Agent Factory   │                       │
│              └────────┬─────────┘                       │
│                       │                                 │
│         ┌─────────────┴──────────────┐                  │
│         │                            │                  │
│  ┌──────▼───────┐          ┌─────────▼────────┐        │
│  │    Claude    │          │       GPT-5      │        │
│  │  Adapter     │          │     Adapter      │        │
│  └──────────────┘          └──────────────────┘        │
└─────────────────────────────────────────────────────────┘
                         │
                ┌────────┴─────────┐
                │                  │
         ┌──────▼──────┐    ┌──────▼──────┐
         │  Supabase   │    │ Expo Snack  │
         │  (Storage)  │    │  (Preview)  │
         └─────────────┘    └─────────────┘
```

### Technology Stack

**Mobile:**
- React Native 0.81
- Expo SDK 54
- TypeScript
- Expo Router (file-based navigation)
- Zustand (state management)
- Socket.io Client
- react-native-webview
- expo-av (voice recording)
- expo-image-picker

**Backend:**
- Node.js + Express
- TypeScript
- Socket.io Server
- Anthropic SDK (Claude)
- OpenAI SDK (GPT-5, Whisper)
- Supabase Client
- Expo Snack SDK

**Design:**
- Minimalist black theme (#0F0F0F)
- Purple accent (#8B5CF6)
- High contrast typography
- Emoji-free professional interface

## Project Structure

```
Pocketable/
├── pocketable/
│   ├── mobile/                # React Native + Expo app
│   │   ├── app/              # Expo Router screens
│   │   │   ├── index.tsx     # Main chat interface
│   │   │   ├── settings.tsx  # Settings & documentation
│   │   │   └── preview.tsx   # Full-screen preview
│   │   └── src/
│   │       ├── components/   # Reusable UI components
│   │       ├── stores/       # Zustand state stores
│   │       ├── services/     # API clients & utilities
│   │       └── theme/        # Design system
│   │
│   ├── backend/              # Node.js backend
│   │   └── src/
│   │       ├── agents/       # AI model adapters
│   │       ├── config/       # Configuration & prompts
│   │       ├── routes/       # API routes
│   │       ├── services/     # Business logic
│   │       ├── tools/        # Utilities (Snack API)
│   │       └── server.ts     # Main server
│   │
│   └── terraform/            # Infrastructure as Code
│
├── daytona/                  # Development environment
└── waitlist-website/         # Landing page
```

## Usage

### Chat Interface

1. **Select AI Model** - Tap the model picker to switch between Claude Sonnet 4.5 and GPT-5
2. **Choose Mode**:
   - **Auto** - AI decides whether to plan or build
   - **Plan** - AI presents a plan for approval before building
   - **Build** - AI generates code immediately
3. **Input Options**:
   - **Text** - Type your app idea
   - **Voice** - Tap microphone, speak, then stop to transcribe
   - **Image** - Upload screenshots for UI inspiration
4. **View Preview** - Tap the preview button when code is generated

### Project Management

- **Create Project** - Start a new project from the sidebar
- **Save Progress** - Projects auto-save to Supabase (if configured)
- **Load Project** - Select from your project list
- **Share** - Export conversation or share preview URL

### Voice Input

1. Tap the microphone button (⦿)
2. Speak naturally describing your app
3. Tap stop when finished
4. Review the transcription (powered by Whisper)
5. Send to AI for processing

### Image Upload

1. Tap the plus button (+)
2. Select an image from your gallery
3. AI analyzes the image using vision models
4. Description is added to your message
5. Great for UI mockups, logos, and design inspiration

## Supabase Setup (Optional)

For project persistence and multi-device sync:

1. Create a project at [supabase.com](https://supabase.com)
2. Copy project URL and anon key to `backend/.env`
3. Run the schema:
   - Open Supabase SQL Editor
   - Execute `backend/src/config/supabase-schema.sql`
4. Restart the backend server

Without Supabase, the app works for single sessions but won't persist projects.

## API Keys

### Required

- **ANTHROPIC_API_KEY** - For Claude Sonnet 4.5 functionality
  - Get yours at: https://console.anthropic.com/
- **OPENAI_API_KEY** - For GPT-5, voice transcription, and image analysis
  - Get yours at: https://platform.openai.com/

### Optional

- **SUPABASE_URL** & **SUPABASE_ANON_KEY** - For project storage

## Development

### Backend Development

```bash
cd pocketable/backend
npm run dev        # Start with hot reload
npm run build      # Compile TypeScript
npm start          # Production mode
```

### Mobile Development

```bash
cd pocketable/mobile
npm start                    # Start Expo
npm run start:local          # Use local backend
npm run build:preview        # Build for testing
npm run build:production     # Production build
```

### Testing

```bash
# Check backend health
curl http://localhost:3001/health

# Test Snack API
curl http://localhost:3001/test-snack
```

## Features

### Completed ✅

- [x] Real-time AI chat with streaming responses
- [x] Dual AI model support (Claude & GPT-5)
- [x] WebSocket-based communication
- [x] In-app live preview with Expo Snack
- [x] Voice input with Whisper transcription
- [x] Image upload with AI vision analysis
- [x] Project management with Supabase
- [x] Export conversations and share previews
- [x] Drawer navigation (ChatGPT-style)
- [x] Platform toggle (iOS/Android/Web)

### Roadmap

- [ ] Web companion app
- [ ] QR code generation for testing
- [ ] Multi-file project support
- [ ] User authentication
- [ ] Rate limiting and cost controls
- [ ] Unit and E2E tests
- [ ] Production deployment with EAS

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Built with [Anthropic's Claude](https://www.anthropic.com/)
- Powered by [OpenAI's GPT](https://openai.com/)
- Preview by [Expo Snack](https://snack.expo.dev/)
- Storage by [Supabase](https://supabase.com/)

## Support

For issues, questions, or contributions, please visit our [GitHub Issues](https://github.com/Snorman-zzz/Pocketable/issues) page.

---

Made with ❤️ for developers who dream in code
