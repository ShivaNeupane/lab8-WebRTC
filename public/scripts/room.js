/**
 * ZoomClone — Room Script
 * Handles WebRTC (PeerJS) connections, Socket.io signaling,
 * media controls, chat, and UI updates.
 */

/* ─────────────────────────────────────────────
   INIT: Parse room ID and user info
───────────────────────────────────────────── */
const ROOM_ID = window.location.pathname.replace('/', '').trim();
const MY_NAME = sessionStorage.getItem('userName') || 'User_' + Math.random().toString(36).substr(2, 4);

let myPeerId = null;
let localStream = null;
let screenStream = null;
let isMuted = false;
let isVideoOff = false;
let isSharingScreen = false;
let chatOpen = false;
let unreadMessages = 0;
let meetingSeconds = 0;

const peers = {}; // peerId → { call, stream, videoEl, tileEl }
const peerNames = {}; // peerId → name

/* ─────────────────────────────────────────────
   DOM REFS
───────────────────────────────────────────── */
const videoGrid    = document.getElementById('videoGrid');
const localVideo   = document.getElementById('localVideo');
const localNoVideo = document.getElementById('localNoVideo');
const localAvatar  = document.getElementById('localAvatar');
const localNameEl  = document.getElementById('localName');
const localNamePlaceholder = document.getElementById('localNamePlaceholder');
const peerCountEl  = document.getElementById('peerCount');
const displayRoomId = document.getElementById('displayRoomId');
const myNameDisplay = document.getElementById('myNameDisplay');
const chatMessages = document.getElementById('chatMessages');
const chatInput    = document.getElementById('chatInput');
const chatSidebar  = document.getElementById('chatSidebar');
const chatBadge    = document.getElementById('chatBadge');

/* ─────────────────────────────────────────────
   SETUP: Names and Room ID display
───────────────────────────────────────────── */
localNameEl.textContent = MY_NAME + ' (You)';
localNamePlaceholder.textContent = MY_NAME;
localAvatar.textContent = MY_NAME.charAt(0).toUpperCase();
myNameDisplay.textContent = MY_NAME;
displayRoomId.textContent = ROOM_ID;

/* ─────────────────────────────────────────────
   SOCKET + PEER INIT
───────────────────────────────────────────── */
const socket = io('/');

const peer = new Peer(undefined, {
  host: '/',
  port: window.location.port || 443,
  path: '/peerjs',
  secure: window.location.protocol === 'https:',
});

/* ─────────────────────────────────────────────
   GET LOCAL MEDIA
───────────────────────────────────────────── */
async function getLocalStream() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    showToast('Camera and microphone ready ✓');
  } catch (err) {
    console.warn('[media] Could not get camera/mic:', err);
    showToast('⚠ Could not access camera/mic. Others may not see you.');
    localStream = new MediaStream(); // empty stream so calls still work
    localNoVideo.style.display = 'flex';
    localVideo.style.display = 'none';
  }
}

/* ─────────────────────────────────────────────
   PEER: when our peer ID is assigned, join room
───────────────────────────────────────────── */
peer.on('open', async (id) => {
  myPeerId = id;
  console.log('[peer] My peer id:', id);

  await getLocalStream();

  // Tell the server we joined
  socket.emit('join-room', ROOM_ID, id, MY_NAME);
  startMeetingTimer();
});

/* ─────────────────────────────────────────────
   PEER: answer incoming calls
───────────────────────────────────────────── */
peer.on('call', (call) => {
  const callerId = call.peer;
  const callerName = peerNames[callerId] || 'Peer';
  console.log('[peer] Incoming call from', callerName, callerId);

  // Register early so duplicate calls are ignored, but tileEl is still null
  peers[callerId] = { call, stream: null, videoEl: null, tileEl: null };

  call.answer(localStream);

  call.on('stream', (remoteStream) => {
    // Only create the tile if it hasn't been created yet (tileEl === null)
    if (!peers[callerId] || !peers[callerId].tileEl) {
      addRemotePeer(callerId, callerName, call, remoteStream);
    } else {
      // Tile already exists — just update its stream (e.g. screen share swap)
      peers[callerId].stream = remoteStream;
      peers[callerId].videoEl.srcObject = remoteStream;
    }
  });

  call.on('close', () => removePeer(callerId));
  call.on('error', (err) => {
    console.error('[peer] Call error:', err);
    removePeer(callerId);
  });
});

/* ─────────────────────────────────────────────
   SOCKET: someone else joined
───────────────────────────────────────────── */
socket.on('user-connected', (userId, userName) => {
  console.log('[socket] User connected:', userName, userId);
  peerNames[userId] = userName;
  showToast(`${userName} joined the meeting`);
  addSystemMsg(`${userName} joined`);

  // Small delay to let them set up before calling
  setTimeout(() => {
    callPeer(userId, userName);
  }, 800);
});

/* ─────────────────────────────────────────────
   SOCKET: someone disconnected
───────────────────────────────────────────── */
socket.on('user-disconnected', (userId) => {
  const name = peerNames[userId] || 'Someone';
  console.log('[socket] User disconnected:', name);
  showToast(`${name} left the meeting`);
  addSystemMsg(`${name} left`);
  if (peers[userId]) {
    peers[userId].call?.close();
    removePeer(userId);
  }
});

/* ─────────────────────────────────────────────
   SOCKET: chat messages
───────────────────────────────────────────── */
socket.on('receive-message', (message, senderName) => {
  const isOwnMsg = senderName === MY_NAME;
  appendChatMessage(message, senderName, isOwnMsg);
  if (!chatOpen && !isOwnMsg) {
    unreadMessages++;
    chatBadge.textContent = unreadMessages;
    chatBadge.style.display = 'flex';
  }
});

/* ─────────────────────────────────────────────
   SOCKET: remote audio/video toggle events
───────────────────────────────────────────── */
socket.on('user-toggle-audio', (userId, state) => {
  updatePeerMicIcon(userId, state);
});

socket.on('user-toggle-video', (userId, state) => {
  updatePeerVideoState(userId, state);
});

/* ─────────────────────────────────────────────
   WEBRTC: Call a peer
───────────────────────────────────────────── */
function callPeer(userId, userName) {
  if (!localStream) return;
  console.log('[peer] Calling', userName, userId);

  const call = peer.call(userId, localStream);
  if (!call) return;

  peers[userId] = { call, stream: null, videoEl: null, tileEl: null };

  call.on('stream', (remoteStream) => {
    if (peers[userId] && !peers[userId].tileEl) {
      addRemotePeer(userId, userName, call, remoteStream);
    } else if (peers[userId]) {
      peers[userId].stream = remoteStream;
      peers[userId].videoEl.srcObject = remoteStream;
    }
  });

  call.on('close', () => removePeer(userId));
  call.on('error', (err) => {
    console.error('[peer] Call error:', err);
    removePeer(userId);
  });
}

/* ─────────────────────────────────────────────
   UI: Add remote peer tile
───────────────────────────────────────────── */
function addRemotePeer(userId, userName, call, stream) {
  peers[userId] = { call, stream, videoEl: null, tileEl: null };
  peerNames[userId] = userName;

  const tile = document.createElement('div');
  tile.className = 'video-tile';
  tile.id = 'tile-' + userId;

  const video = document.createElement('video');
  video.autoplay = true;
  video.playsinline = true;
  video.srcObject = stream;

  const overlay = document.createElement('div');
  overlay.className = 'tile-overlay';
  overlay.innerHTML = `
    <div class="participant-name">${userName}</div>
    <div class="tile-status-icons">
      <span class="status-icon" id="mic-${userId}" title="Mic">🎤</span>
      <span class="status-icon" id="cam-${userId}" title="Camera">📹</span>
    </div>
  `;

  const placeholder = document.createElement('div');
  placeholder.className = 'no-video-placeholder';
  placeholder.id = 'placeholder-' + userId;
  placeholder.style.display = 'none';
  placeholder.innerHTML = `
    <div class="avatar-large">${userName.charAt(0).toUpperCase()}</div>
    <span>${userName}</span>
  `;

  tile.appendChild(video);
  tile.appendChild(overlay);
  tile.appendChild(placeholder);
  videoGrid.appendChild(tile);

  peers[userId].videoEl = video;
  peers[userId].tileEl = tile;

  updateGridLayout();
  updateParticipantCount();
}

/* ─────────────────────────────────────────────
   UI: Remove peer tile
───────────────────────────────────────────── */
function removePeer(userId) {
  if (peers[userId]) {
    peers[userId].call?.close();
    peers[userId].tileEl?.remove();
    delete peers[userId];
  }
  delete peerNames[userId];
  updateGridLayout();
  updateParticipantCount();
}

/* ─────────────────────────────────────────────
   UI: Grid layout
───────────────────────────────────────────── */
function updateGridLayout() {
  const count = Object.keys(peers).length + 1; // +1 for self
  videoGrid.className = 'video-grid';
  if (count === 1)      videoGrid.classList.add('grid-1');
  else if (count === 2) videoGrid.classList.add('grid-2');
  else if (count === 3) videoGrid.classList.add('grid-3');
  else if (count === 4) videoGrid.classList.add('grid-4');
  else                  videoGrid.classList.add('grid-many');
}

function updateParticipantCount() {
  const count = Object.keys(peers).length + 1;
  peerCountEl.textContent = count;
}

/* ─────────────────────────────────────────────
   CONTROLS: Mute/Unmute
───────────────────────────────────────────── */
function toggleMic() {
  isMuted = !isMuted;
  if (localStream) {
    localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
  }

  const muteBtn = document.getElementById('muteBtn');
  const micOnIcon = document.getElementById('micOnIcon');
  const micOffIcon = document.getElementById('micOffIcon');
  const muteLabel = document.getElementById('muteLabel');
  const localMicIcon = document.getElementById('localMicIcon');

  if (isMuted) {
    muteBtn.classList.add('muted-state');
    micOnIcon.style.display = 'none';
    micOffIcon.style.display = '';
    muteLabel.textContent = 'Unmute';
    localMicIcon.classList.add('muted');
    localMicIcon.title = 'Muted';
    showToast('You are muted 🔇');
  } else {
    muteBtn.classList.remove('muted-state');
    micOnIcon.style.display = '';
    micOffIcon.style.display = 'none';
    muteLabel.textContent = 'Mute';
    localMicIcon.classList.remove('muted');
    localMicIcon.title = 'Mic active';
    showToast('You are unmuted 🎤');
  }

  socket.emit('user-toggle-audio', myPeerId, !isMuted);
}

/* ─────────────────────────────────────────────
   CONTROLS: Video toggle
───────────────────────────────────────────── */
function toggleVideo() {
  isVideoOff = !isVideoOff;
  if (localStream) {
    localStream.getVideoTracks().forEach(t => t.enabled = !isVideoOff);
  }

  const videoBtn = document.getElementById('videoBtn');
  const camOnIcon = document.getElementById('camOnIcon');
  const camOffIcon = document.getElementById('camOffIcon');
  const videoLabel = document.getElementById('videoLabel');

  if (isVideoOff) {
    videoBtn.classList.add('muted-state');
    camOnIcon.style.display = 'none';
    camOffIcon.style.display = '';
    videoLabel.textContent = 'Start Video';
    localVideo.style.display = 'none';
    localNoVideo.style.display = 'flex';
    showToast('Camera off 📷');
  } else {
    videoBtn.classList.remove('muted-state');
    camOnIcon.style.display = '';
    camOffIcon.style.display = 'none';
    videoLabel.textContent = 'Stop Video';
    localVideo.style.display = '';
    localNoVideo.style.display = 'none';
    showToast('Camera on 📹');
  }

  socket.emit('user-toggle-video', myPeerId, !isVideoOff);
}

/* ─────────────────────────────────────────────
   CONTROLS: Screen Share
───────────────────────────────────────────── */
async function toggleScreenShare() {
  const shareBtn = document.getElementById('shareBtn');

  if (!isSharingScreen) {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];

      // Replace video track in all active peer connections
      Object.values(peers).forEach(({ call }) => {
        if (call?.peerConnection) {
          const sender = call.peerConnection.getSenders().find(s =>
            s.track && s.track.kind === 'video'
          );
          if (sender) sender.replaceTrack(screenTrack);
        }
      });

      // Show screen in local video
      localVideo.srcObject = screenStream;
      localVideo.style.removeProperty('display');
      localNoVideo.style.display = 'none';

      isSharingScreen = true;
      shareBtn.classList.add('active');
      showToast('Screen sharing started 🖥');

      screenTrack.onended = () => {
        stopScreenShare();
      };
    } catch (err) {
      console.warn('[screen] Screen share cancelled or failed:', err);
    }
  } else {
    stopScreenShare();
  }
}

function stopScreenShare() {
  if (!screenStream) return;
  const shareBtn = document.getElementById('shareBtn');

  screenStream.getTracks().forEach(t => t.stop());

  // Restore camera track
  const camTrack = localStream?.getVideoTracks()[0];
  Object.values(peers).forEach(({ call }) => {
    if (call?.peerConnection) {
      const sender = call.peerConnection.getSenders().find(s =>
        s.track && s.track.kind === 'video'
      );
      if (sender && camTrack) sender.replaceTrack(camTrack);
    }
  });

  localVideo.srcObject = localStream;
  if (isVideoOff) {
    localVideo.style.display = 'none';
    localNoVideo.style.display = 'flex';
  }

  screenStream = null;
  isSharingScreen = false;
  shareBtn.classList.remove('active');
  showToast('Screen sharing stopped');
}

/* ─────────────────────────────────────────────
   CONTROLS: Leave meeting
───────────────────────────────────────────── */
function leaveMeeting() {
  localStream?.getTracks().forEach(t => t.stop());
  screenStream?.getTracks().forEach(t => t.stop());
  Object.values(peers).forEach(({ call }) => call?.close());
  peer.destroy();
  socket.disconnect();
  window.location.href = '/';
}

/* ─────────────────────────────────────────────
   CHAT
───────────────────────────────────────────── */
function toggleChat() {
  chatOpen = !chatOpen;
  chatSidebar.classList.toggle('open', chatOpen);
  document.getElementById('chatBtn').classList.toggle('active', chatOpen);

  if (chatOpen) {
    unreadMessages = 0;
    chatBadge.style.display = 'none';
    chatBadge.textContent = '0';
    setTimeout(() => chatInput.focus(), 300);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

function sendMessage() {
  const msg = chatInput.value.trim();
  if (!msg) return;
  socket.emit('send-message', msg, MY_NAME);
  chatInput.value = '';
}

function appendChatMessage(message, senderName, isOwn) {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const div = document.createElement('div');
  div.className = 'chat-msg' + (isOwn ? ' own' : '');
  div.innerHTML = `
    <div class="chat-msg-header">
      <span class="chat-msg-sender${isOwn ? ' you' : ''}">${isOwn ? 'You' : senderName}</span>
      <span class="chat-msg-time">${time}</span>
    </div>
    <div class="chat-msg-text">${escapeHtml(message)}</div>
  `;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addSystemMsg(text) {
  const div = document.createElement('div');
  div.className = 'chat-system-msg';
  div.textContent = text;
  chatMessages.appendChild(div);
  if (chatOpen) chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Chat: Enter to send
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

/* ─────────────────────────────────────────────
   REMOTE PEER UI UPDATES
───────────────────────────────────────────── */
function updatePeerMicIcon(userId, isActive) {
  const el = document.getElementById('mic-' + userId);
  if (!el) return;
  el.classList.toggle('muted', !isActive);
  el.title = isActive ? 'Mic active' : 'Muted';
}

function updatePeerVideoState(userId, isActive) {
  const videoEl = peers[userId]?.videoEl;
  const placeholder = document.getElementById('placeholder-' + userId);
  if (!videoEl || !placeholder) return;

  if (!isActive) {
    videoEl.style.display = 'none';
    placeholder.style.display = 'flex';
  } else {
    videoEl.style.display = '';
    placeholder.style.display = 'none';
  }
}

/* ─────────────────────────────────────────────
   COPY ROOM ID
───────────────────────────────────────────── */
function copyRoomId() {
  // Copy just the Meeting ID (not the full URL)
  navigator.clipboard.writeText(ROOM_ID).then(() => {
    showToast('Meeting ID copied! 📋');
  }).catch(() => {
    // Fallback for browsers that block clipboard API
    const el = document.createElement('textarea');
    el.value = ROOM_ID;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    showToast('Meeting ID copied! 📋');
  });
}

/* ─────────────────────────────────────────────
   MEETING TIMER
───────────────────────────────────────────── */
function startMeetingTimer() {
  const timerEl = document.getElementById('meetingTimer');
  setInterval(() => {
    meetingSeconds++;
    const h = Math.floor(meetingSeconds / 3600);
    const m = Math.floor((meetingSeconds % 3600) / 60);
    const s = meetingSeconds % 60;
    timerEl.textContent = h > 0
      ? `${pad(h)}:${pad(m)}:${pad(s)}`
      : `${pad(m)}:${pad(s)}`;
  }, 1000);
}

function pad(n) { return String(n).padStart(2, '0'); }

/* ─────────────────────────────────────────────
   TOAST NOTIFICATION
───────────────────────────────────────────── */
let toastTimeout = null;
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 3000);
}

/* ─────────────────────────────────────────────
   Utils
───────────────────────────────────────────── */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}

/* ─────────────────────────────────────────────
   PEER ERROR HANDLING
───────────────────────────────────────────── */
peer.on('error', (err) => {
  console.error('[peer] Error:', err);
  showToast('Connection error: ' + err.type);
});

socket.on('connect_error', (err) => {
  console.error('[socket] Connect error:', err);
});

// Initialize grid layout on start
updateGridLayout();
updateParticipantCount();
