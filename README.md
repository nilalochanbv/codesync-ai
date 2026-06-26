# 🚀 CodeSync AI

CodeSync AI is a high-fidelity, real-time collaborative development environment (IDE) running entirely in the browser. It is designed to look, feel, and behave like VS Code, supporting real-time multiplayer coding, terminal execution, diagnostics, interactive debugging, and local file system access.

---

## ✨ Features

### 💻 Monaco Code Editor (VS Code Engine)
*   **Native Feel**: Full integration of the VS Code editor core with syntax highlighting, IntelliSense, auto-completion, multi-cursor, and folding.
*   **Syntax Diagnostics**: Code syntax checking displaying red squiggly lines directly on error-prone code lines and listable inside a clickable **Problems** panel.
*   **Gutter Breakpoints**: Set execution breakpoints with a click in the gutter margin, decorated with red glyph indicators.
*   **Save Indicators**: Real-time save indicators (blue dot `●` indicators on modified files) and manual save (`Ctrl + S`) bindings.

### 👥 Live Share Collaboration
*   **Real-time Synchronization**: Concurrent code editing with character-by-character synchronization, retaining Monaco's undo/redo history.
*   **Collaborative Cursors**: Absolute-positioned live cursor indicators with glowing user flags showing selections across workspace developers editing the same file.
*   **Live Chat**: Built-in chat channel for room participants to coordinate and exchange messages in real-time.
*   **Presence Indicators**: Live member list showing online status, typing alerts, current file location, and owner badges.

### ⚙️ Multi-Language Execution Engine
*   **Language Selector**: Supports Java, Python, C, C++, JavaScript, Go, Rust, and Kotlin.
*   **Real Compiler Streams**: Real-time standard output (stdout), standard error (stderr), and standard input (stdin) terminal console streams running actual code compilations.
*   **Judge0 & Local Sandboxing**: Configurable support for remote Judge0 execution or secure local execution sandboxes.

### 📂 File Explorer & Local Workspace API
*   **Interactive Explorer**: Context actions to create files, create folders, rename, delete, and duplicate files.
*   **Local Directory Binding**: Integrates the native **File System Access API** (`showDirectoryPicker()`) to let developers open folders on their local computer disk and sync changes directly.

### 🐛 Stepper Debugger Simulator
*   **Debugger Console**: Tools for stepping through code execution (Start, Step Over, Continue, Stop).
*   **Inspection Widgets**: Variable scope inspector, Call Stack logs, and custom Watch List evaluate expressions.

### 🕒 Workspace snapshots & Activity Timelines
*   **Version History**: Capture manual snapshot saves to restore workspace files to previous code revisions.
*   **Activity Timeline**: Log workspace-wide events (e.g. member joins, file additions, restorations) chronologically.

---

## 🛠️ Technology Stack

*   **Frontend**:
    *   Vite + React 19 + TypeScript
    *   Zustand (Global State Management)
    *   Tailwind CSS (Styling)
    *   Monaco Editor (`@monaco-editor/react`)
    *   Framer Motion (Animations)
    *   Socket.IO Client (Real-time gateway)
*   **Backend**:
    *   Node.js + Express + TypeScript
    *   Socket.IO (WebSockets connection server)
    *   MongoDB & Mongoose (Data persistence)
    *   Child Process Sandboxes (Compiler runner)

---

## 🚀 Setup & Installation

### 📋 Prerequisites
Ensure you have the following installed:
*   [Node.js](https://nodejs.org/) (v18+)
*   [MongoDB](https://www.mongodb.com/) (running locally on port 27017 or a remote Atlas connection URI)
*   Compilers for languages you wish to compile locally (e.g., `javac` for Java, `g++`/`gcc` for C/C++, `python` for Python).

### 1. Clone the repository
```bash
git clone https://github.com/nilalochanbv/codesync-ai.git
cd codesync-ai
```

### 2. Configure Backend Server
Create a `.env` file inside the `server/` directory:
```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/codesync
JWT_SECRET=super_secret_codesync_token_key_123!
CLIENT_URL=http://localhost:5173
```

Install server dependencies and start the dev server:
```bash
cd server
npm install
npm run dev
```
*The server will start listening on `http://localhost:5000`.*

### 3. Configure Frontend Client
Install client dependencies and start the dev server:
```bash
cd ../client
npm install
npm run dev
```
*The Vite client will launch on `http://localhost:5173/`.*

---

## 🔒 Security Warning
Ensure `.env` files are added to your `.gitignore` to prevent secret key leakage. Local directory parsing runs on the user's browser via native web APIs, avoiding file exposure to the cloud database.
