<div align="center">

# 📱 Pocketable

### Build React Native apps with AI — right from your phone

**Mobile-first AI coding assistant powered by Claude Sonnet 4.5 & GPT-5**

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![React Native](https://img.shields.io/badge/React_Native-0.81-61DAFB?logo=react)](https://reactnative.dev/)
[![Expo](https://img.shields.io/badge/Expo-54-000020?logo=expo)](https://expo.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript)](https://www.typescriptlang.org/)

[⚡ Quick Start](#-quick-start) • [🎯 Features](#-features) • [📖 Docs](#-documentation) • [🚀 Deploy](#-deployment)

</div>

---

## ✨ Why Pocketable?

> Build production-ready React Native apps using just your voice, on your phone, while commuting.

Traditional AI coding assistants require you to be at a desktop. **Pocketable brings Claude Sonnet 4.5 and GPT-5 to your mobile device.**

- 🎤 **Voice-First** — Speak your app idea, get working code via Whisper
- 👁️ **Live Previews** — See results instantly with Expo Snack integration
- 🖼️ **Image-to-Code** — Convert UI screenshots to React Native components
- 🤖 **Dual AI** — Switch between Claude Sonnet 4.5 & GPT-5 mid-conversation
- 🔒 **Self-Hosted** — Your code stays private in Daytona sandboxes
- 🔓 **Open Source** — MIT licensed, fully customizable

### How It Compares

| Feature | Pocketable | Cursor | VibeCode | Lovable |
|---------|-----------|--------|----------|---------|
| 📱 Mobile-Native | ✅ | ❌ | ✅ | ❌ |
| 🎤 Voice Input | ✅ | ❌ | ❌ | ❌ |
| 👁️ Live Preview | ✅ | ❌ | ✅ | ✅ |
| 🤖 Multi-Model | ✅ Claude + GPT | ✅ | ❌ | ❌ |
| 🔓 Open Source | ✅ | ❌ | ❌ | ❌ |
| 🏗️ Self-Hosted | ✅ | ❌ | ❌ | ❌ |

---

## 🎯 Features

<table>
<tr>
<td width="50%">

### 🧠 Dual AI Power
- **Claude Sonnet 4.5** for best-in-class code generation
- **GPT-5** for alternative approaches
- Switch models mid-conversation
- Smart routing based on task type

</td>
<td width="50%">

### 🗣️ Multimodal Input
- 🎤 **Voice-to-Code** via OpenAI Whisper
- 📷 **Image-to-Code** via Vision API
- ⌨️ **Text Chat** with streaming responses
- 🔄 Mix and match input modes

</td>
</tr>
<tr>
<td width="50%">

### 👁️ Live Previews
- Instant Expo Snack integration
- iOS/Android/Web platform toggle
- Share working demos via URL
- Real-time code updates

</td>
<td width="50%">

### 🔐 Secure Execution
- Daytona sandbox isolation
- Ephemeral containers
- Self-hosted deployment option
- No code exposure to third parties

</td>
</tr>
</table>

**Additional Features:**
- ✅ Real-time AI streaming responses
- ✅ Project management with Supabase
- ✅ Export conversations as Markdown
- ✅ Code snippet copying
- ✅ Auto/Plan/Build modes

---

## ⚡ Quick Start

> Get running in 5 minutes

```bash
# 1. Clone the repo
git clone https://github.com/Snorman-zzz/pocketable.git
cd pocketable

# 2. Start Daytona (self-hosted sandbox)
cd ../daytona/docker && docker compose up -d

# 3. Configure and start backend
cd ../../pocketable/backend
# Add your API keys to .env (see Environment Setup below)
npm install && npm run dev

# 4. Start mobile app (new terminal)
cd ../mobile
npm install && npm run start:local
```

Press `i` for iOS or `a` for Android. **Done!** 🎉

> [!TIP]
> First time? See **[QUICKSTART.md](QUICKSTART.md)** for detailed setup including Daytona configuration.

> [!IMPORTANT]
> **Required API Keys:**
> - `ANTHROPIC_API_KEY` — For Claude Sonnet 4.5
> - `OPENAI_API_KEY` — For GPT-5, Whisper transcription, and Vision API
> - Daytona credentials — See [DAYTONA-SETUP.md](DAYTONA-SETUP.md)

---

## 🏗️ Architecture

```mermaid
graph TB
    A[📱 Mobile App<br/>React Native + Expo] -->|WebSocket| B[⚡ Backend API<br/>Node.js + Express]
    B -->|Agent Factory| C[🤖 Claude SDK<br/>Sonnet 4.5]
    B -->|Agent Factory| D[🤖 OpenAI SDK<br/>GPT-5, Whisper]
    C --> E[🏗️ Daytona SDK<br/>Sandbox Manager]
    D --> E
    E -->|Docker| F[🐳 Ephemeral Sandboxes<br/>Isolated Containers]

    style A fill:#8B5CF6
    style B fill:#3B82F6
    style C fill:#10B981
    style D fill:#F59E0B
    style E fill:#EF4444
    style F fill:#6366F1
```

**Flow:** Voice/Text/Image → Backend → AI Model → Code Execution → Live Preview

<details>
<summary><b>Detailed Architecture</b></summary>

### Dual-Process Communication

```
Mobile (Expo) ←→ WebSocket (Socket.io) ←→ Backend (Express)
                                           ↓
                                    Agent Factory
                                    ↓         ↓
                              ClaudeAdapter  CodexAdapter
                                    ↓         ↓
                              Claude SDK   OpenAI SDK
```

The backend streams AI responses in real-time via Socket.io:
- `chat` → Mobile sends message
- `message_chunk` → Backend streams response chunks
- `snack_ready` → Preview URL ready
- `complete` → Response finished
- `error` → Error occurred

For complete architecture details, see **[CLAUDE.md](CLAUDE.md)**.

</details>

---

## 💡 Usage

### Build a Todo App with Voice

1. Open Pocketable app
2. Tap 🎤 microphone button
3. Say: *"Create a todo list app with purple theme and categories"*
4. Watch AI generate code in real-time ⚡
5. Tap **"Preview"** to see your app running!

**Result:** Working app in 30 seconds.

### Convert Screenshot to Code

1. Take screenshot of any UI you like
2. Tap 📷 camera button and upload
3. Type: *"Recreate this UI in React Native"*
4. AI analyzes image and generates matching components
5. Iterate and refine!

### Switch Between AI Models

1. Build initial version with Claude Sonnet 4.5
2. Tap model picker → Switch to GPT-5
3. Ask: *"Refactor this to use Zustand for state"*
4. Compare different AI approaches
5. Pick the best implementation!

---

## 🔧 Environment Setup

### Prerequisites

- Node.js 18+
- Docker (for Daytona)
- iOS Simulator / Android Emulator / Expo Go app

### Backend Configuration

Create `backend/.env`:

```env
# AI Model APIs
ANTHROPIC_API_KEY=sk-ant-api03-...     # Required for Claude Sonnet 4.5
OPENAI_API_KEY=sk-...                   # Required for GPT-5, Whisper, Vision

# Self-Hosted Daytona
DAYTONA_API_KEY=<from-daytona-setup>
DAYTONA_API_URL=http://localhost:3000/api
DAYTONA_ORGANIZATION_ID=<from-daytona-setup>
DAYTONA_TARGET=us

# Database (Optional - enables project persistence)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
DATABASE_URL=postgresql://user:pass@localhost:5432/pocketable

# Server
PORT=3001
ROUTING_ENABLED=true
```

**Get Daytona credentials:**
```bash
cd /path/to/daytona/docker
docker compose logs api | grep "Admin user created with API key:"
docker compose exec -T db psql -U user -d daytona -c "SELECT id FROM organization;"
```

See **[DAYTONA-SETUP.md](DAYTONA-SETUP.md)** for complete Daytona setup.

<details>
<summary><b>Supabase Setup (Optional)</b></summary>

Enables project persistence across sessions:

1. Create project at [supabase.com](https://supabase.com)
2. Copy URL and anon key to `.env`
3. Run `backend/src/config/supabase-schema.sql` in Supabase SQL Editor
4. Verify: `curl http://localhost:3001/health` → `"supabase": "connected"`

**Without Supabase:** Projects work but aren't saved between app restarts.

</details>

---

## 🚀 Deployment

### Mobile App (Expo EAS)

```bash
cd mobile

# Build for all platforms
npm run build:production

# Or build for specific platforms
npm run build:ios         # iOS only
npm run build:android     # Android only
```

Update `mobile/.env.production`:
```env
EXPO_PUBLIC_API_URL=https://api.yourdomain.com
```

### Backend (Production)

```bash
cd backend
npm install
npm run build
npm start
```

**Required environment variables:**
- All variables from [Environment Setup](#-environment-setup)
- Update `DAYTONA_API_URL` to your production Daytona instance

**Deployment Guides:**
- **[DEPLOYMENT.md](DEPLOYMENT.md)** — Cloud deployment with custom Daytona snapshots
- **[AWS-DEPLOYMENT.md](AWS-DEPLOYMENT.md)** — AWS-specific guide
- **[INFRASTRUCTURE.md](INFRASTRUCTURE.md)** — Infrastructure architecture

---

## 🗺️ Roadmap

### ✅ Shipped
- [x] Dual AI support (Claude Sonnet 4.5 + GPT-5)
- [x] Voice input with Whisper transcription
- [x] Image upload with Vision API
- [x] Live Expo Snack previews
- [x] Project persistence with Supabase
- [x] Self-hosted Daytona integration
- [x] Export and sharing features

### 🚧 In Progress
- [ ] Web companion app with QR codes
- [ ] Multi-file code extraction
- [ ] Error boundaries and retry logic

### 🔮 Planned
- [ ] iOS App Store release
- [ ] Android Play Store release
- [ ] User authentication (Supabase Auth)
- [ ] Team collaboration features
- [ ] Template marketplace
- [ ] GitHub integration
- [ ] VSCode extension
- [ ] Custom AI model fine-tuning

**Want to influence the roadmap?** Open a [discussion](https://github.com/Snorman-zzz/pocketable/discussions)!

---

## 🛠️ Tech Stack

### Mobile
![React Native](https://img.shields.io/badge/React_Native-0.81-61DAFB?style=for-the-badge&logo=react)
![Expo](https://img.shields.io/badge/Expo-54-000020?style=for-the-badge&logo=expo)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript)
![Zustand](https://img.shields.io/badge/Zustand-5.0-orange?style=for-the-badge)

### Backend
![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js)
![Express](https://img.shields.io/badge/Express-5.1-000000?style=for-the-badge&logo=express)
![Socket.io](https://img.shields.io/badge/Socket.io-4.0-010101?style=for-the-badge&logo=socket.io)
![Prisma](https://img.shields.io/badge/Prisma-6.17-2D3748?style=for-the-badge&logo=prisma)

### AI & Infrastructure
![Claude](https://img.shields.io/badge/Claude-Sonnet_4.5-5A67D8?style=for-the-badge)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--5-412991?style=for-the-badge)
![Daytona](https://img.shields.io/badge/Daytona-Sandbox-FF6B6B?style=for-the-badge)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=for-the-badge&logo=supabase)

---

## 🔧 Troubleshooting

<details>
<summary><b>Backend won't start</b></summary>

```bash
# Kill existing processes
pkill -f "tsx watch src/server.ts"

# Check port is free
lsof -i :3001

# Restart
cd backend && npm run dev
```
</details>

<details>
<summary><b>"Invalid API key" error (Daytona)</b></summary>

```bash
# Get new API key from logs
cd /path/to/daytona/docker
docker compose logs api | grep "Admin user created"

# Update backend/.env with new key
# Restart backend
pkill -f "tsx watch" && cd backend && npm run dev
```
</details>

<details>
<summary><b>Mobile can't connect to backend</b></summary>

1. Verify backend is running: `curl http://localhost:3001/health`
2. Check `mobile/.env.development` has `EXPO_PUBLIC_API_URL=http://localhost:3001`
3. Ensure mobile and backend are on same network (for physical devices)
</details>

<details>
<summary><b>Slow code generation (>90 seconds)</b></summary>

1. Check backend logs for "Sandbox image: ubuntu-node20"
2. If missing, Node.js isn't pre-installed in Daytona snapshot
3. See **[DEPLOYMENT.md](DEPLOYMENT.md)** for snapshot optimization
</details>

<details>
<summary><b>Voice input not working</b></summary>

1. Verify `OPENAI_API_KEY` is set in `backend/.env`
2. Check microphone permissions on device
3. Check backend logs for Whisper API errors
</details>

---


## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---
