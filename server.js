const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { ExpressPeerServer } = require('peer');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Socket.io setup
const io = new Server(server);

// PeerJS server setup
const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/',
});

app.use('/peerjs', peerServer);

// Serve static files from "public" folder
app.use(express.static(path.join(__dirname, 'public')));

// Route: serve room page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

// Socket.io signaling
io.on('connection', (socket) => {
  console.log(`[socket] User connected: ${socket.id}`);

  // When a user joins a room
  socket.on('join-room', (roomId, userId, userName) => {
    socket.join(roomId);
    console.log(`[room:${roomId}] ${userName} (${userId}) joined`);

    // Notify everyone else in the room
    socket.to(roomId).emit('user-connected', userId, userName);

    // Handle chat messages
    socket.on('send-message', (message, senderName) => {
      io.to(roomId).emit('receive-message', message, senderName);
    });

    // Handle mute/unmute broadcast
    socket.on('user-toggle-audio', (userId, state) => {
      socket.to(roomId).emit('user-toggle-audio', userId, state);
    });

    // Handle video on/off broadcast
    socket.on('user-toggle-video', (userId, state) => {
      socket.to(roomId).emit('user-toggle-video', userId, state);
    });

    // When user leaves
    socket.on('disconnect', () => {
      console.log(`[room:${roomId}] ${userName} (${userId}) disconnected`);
      socket.to(roomId).emit('user-disconnected', userId);
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚀 ZoomClone server running at http://localhost:${PORT}\n`);
});
