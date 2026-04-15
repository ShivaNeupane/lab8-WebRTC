# Lab 8 — WebRTC Video Conferencing (ZoomClone)

A real-time, peer-to-peer video conferencing web application built with **WebRTC**, **PeerJS**, **Socket.io**, and **Express.js**. Users can create or join meeting rooms, share video/audio, toggle controls, share their screen, and chat in real time — all without any plugins or downloads.

---

## ✨ Features

- 🎥 **Peer-to-peer video & audio** via WebRTC (PeerJS)
- 🔗 **Create or join rooms** using a unique Meeting ID
- 💬 **Live group chat** with timestamps
- 🎤 **Mute / Unmute** microphone
- 📹 **Toggle camera** on/off
- 🖥️ **Screen sharing** (replaces your video stream for all participants)
- 👥 **Dynamic video grid** that adapts to the number of participants
- ⏱️ **Meeting timer** displayed in the control bar
- 📋 **Copy Meeting ID** to clipboard with one click
- 🔔 **Toast notifications** for join/leave/mute events
- 🎨 **Aesthetic black & white UI** with noise grain texture

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | [Express.js](https://expressjs.com/) |
| **Signaling** | [Socket.io](https://socket.io/) |
| **WebRTC / P2P** | [PeerJS](https://peerjs.com/) (server + client) |
| **HTTP Server** | Node.js built-in `http` module |
| **Frontend** | Vanilla HTML, CSS, JavaScript |
| **Fonts** | Google Fonts — Inter |

---

## 📁 Project Structure

```
lab8-WebRTC/
├── server.js               # Express + Socket.io + PeerJS server
├── package.json
├── .gitignore
└── public/
    ├── index.html          # Landing page (create or join a meeting)
    ├── room.html           # Video conference room page
    ├── styles/
    │   ├── landing.css     # Landing page styles
    │   └── room.css        # Room page styles
    └── scripts/
        └── room.js         # WebRTC + Socket.io client logic
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v16 or higher
- npm (comes with Node.js)

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd lab8-WebRTC
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```

4. **Open your browser** and navigate to:
   ```
   http://localhost:3000
   ```

---

## 📖 How to Use

### Starting a Meeting
1. Go to `http://localhost:3000`
2. Enter your display name in the **"New Meeting"** tab
3. Click **"Start New Meeting"** — you'll be taken to your room
4. Click the copy icon next to the Meeting ID in the top bar
5. Share the Meeting ID with anyone you want to invite

### Joining a Meeting
1. Go to `http://localhost:3000`
2. Click the **"Join Meeting"** tab
3. Enter your display name and paste the Meeting ID
4. Click **"Join Meeting"**

### In-Room Controls

| Button | Action |
|---|---|
| **Mute** | Toggle your microphone on/off |
| **Stop Video** | Toggle your camera on/off |
| **Chat** | Open/close the live chat sidebar |
| **Share** | Start/stop screen sharing |
| **Leave** | End the call and return to the home page |

---

## ⚙️ How It Works

### Signaling (Socket.io)
Socket.io handles the signaling layer — coordinating which peers exist in a room and notifying them when others join or leave. It does **not** carry any media data.

### Peer-to-Peer Media (WebRTC + PeerJS)
Once two peers are aware of each other via Socket.io, they establish a direct WebRTC connection using PeerJS. All video, audio, and screen share streams are sent **directly between browsers** — not through the server.

