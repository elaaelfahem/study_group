/**
 * AI Study Group — Frontend Logic
 * Handles Chat, Voice (STT/TTS), and UI Orchestration.
 */

// ── State Management ────────────────────────────────────────────────
const state = {
    sessionId: `session_${Math.random().toString(36).substr(2, 9)}`,
    isListening: false,
    isVoiceEnabled: true,
    isThinking: false,
    history: [],
    pomodoro: {
        timeLeft: 25 * 60,
        isActive: false,
        timer: null
    },
    personas: {
        genius: { name: "The Genius", avatar: "🧠", image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400" },
        confused: { name: "The Confused", avatar: "🤔", image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400" },
        skeptic: { name: "The Skeptic", avatar: "🔍", image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400" },
        summarizer: { name: "The Summarizer", avatar: "📝", image: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400" },
        quiz_master: { name: "Quiz Master", avatar: "🎯", image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400" },
        organizer: { name: "The Organizer", avatar: "📋", image: "https://images.unsplash.com/photo-1554151228-14d9def656e4?w=400" }
    },
    did: {
        peerConnection: null,
        streamId: null,
        sessionId: null,
        statsInterval: null,
        lastVideoState: 'inactive'
    }
};

// ── DOM Elements ────────────────────────────────────────────────────
const elements = {
    messages: document.getElementById('messages'),
    userInput: document.getElementById('userInput'),
    sendBtn: document.getElementById('sendBtn'),
    micBtn: document.getElementById('micBtn'),
    topicInput: document.getElementById('topicInput'),
    modeSelect: document.getElementById('modeSelect'),
    voiceToggle: document.getElementById('voiceToggle'),
    loadingOverlay: document.getElementById('loadingOverlay'),
    loadingText: document.getElementById('loadingText'),
    pomodoroTime: document.getElementById('pomodoroTime'),
    pomodoroBtn: document.getElementById('pomodoroBtn'),
    pomodoroFill: document.getElementById('pomodoroFill'),
    videoGrid: document.getElementById('videoGrid'),
    chatPanel: document.getElementById('chatPanel'),
    toggleChatBtn: document.getElementById('toggleChatBtn'),
    userVideo: document.getElementById('userVideo'),
    tips: document.querySelectorAll('.tip')
};


// ── Import HeyGen SDK (UMD script added to index.html) ─────────────
let avatarManager = null;
let currentAvatarSessionInfo = null;

// ── Initialization ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initEvents();
    initSpeechRecognition();
});

function initEvents() {
    elements.sendBtn.addEventListener('click', sendMessage);
    elements.userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    elements.voiceToggle.addEventListener('click', () => {
        state.isVoiceEnabled = !state.isVoiceEnabled;
        elements.voiceToggle.classList.toggle('active', state.isVoiceEnabled);
    });

    elements.toggleChatBtn.addEventListener('click', () => {
        elements.chatPanel.classList.toggle('hidden');
    });

    elements.pomodoroBtn.addEventListener('click', togglePomodoro);
    
    // Start Camera Mirror
    startUserCamera();

    // Mic Button
    elements.micBtn.addEventListener('mousedown', startListening);
    elements.micBtn.addEventListener('mouseup', stopListening);
    elements.micBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startListening();
    });
    elements.micBtn.addEventListener('touchend', stopListening);
}

// ── Chat Logic ──────────────────────────────────────────────────────
async function sendMessage() {
    const text = elements.userInput.value.trim();
    if (!text || state.isThinking) return;

    elements.userInput.value = '';
    addMessage('you', text);

    state.isThinking = true;
    showLoading(true);

    try {
        const response = await fetch('/session/respond', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: state.sessionId,
                topic: elements.topicInput.value,
                mode: elements.modeSelect.value,
                user_message: text,
                history: formatHistory(),
                course_context: ""
            })
        });

        if (!response.ok) throw new Error('Backend error');

        const data = await response.json();
        showLoading(false);

        // Process persona responses sequentially
        await processResponses(data.responses);

        // Handle mode suggestion
        if (data.suggested_mode) {
            console.log("System suggests changing mode to:", data.suggested_mode);
        }

    } catch (error) {
        console.error("Chat Error:", error);
        addMessage('organizer', "Sorry, I had trouble connecting to the study brain. Is Ollama running?");
        showLoading(false);
    } finally {
        state.isThinking = false;
    }
}

async function processResponses(responses) {
    for (const resp of responses) {
        const personaId = resp.speaker;
        
        // UI: Highlight the specific video cell
        setPersonaState(personaId, 'typing');
        highlightSpeaker(personaId);

        // Add message to chat
        await new Promise(r => setTimeout(r, 600));
        addMessage(personaId, resp.text);

        // HeyGen Animation (FaceTime logic)
        if (state.isVoiceEnabled) {
            try {
                await animateAvatar(resp.text, personaId);
            } catch (e) {
                console.warn("HeyGen Animation failed", e);
                await playVoice(resp.text, personaId);
            }
        } else {
            await new Promise(r => setTimeout(r, 2000));
        }

        setPersonaState(personaId, 'online');
    }
}

function highlightSpeaker(personaId) {
    // Spotlight the current speaker by making their cell larger
    document.querySelectorAll('.video-cell').forEach(cell => {
        cell.classList.remove('spotlight');
    });
    const speakerCell = document.getElementById(`cell-${personaId}`);
    if (speakerCell) speakerCell.classList.add('spotlight');
}

async function startUserCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (elements.userVideo) elements.userVideo.srcObject = stream;
    } catch (e) {
        console.warn("Camera access denied", e);
    }
}

// ── HeyGen Streaming (LiveAvatar) Logic ──────────────────────────────

async function animateAvatar(text, personaId) {
    // Note: LiveAvatar uses specific Avatar IDs. For the hackathon, we'll map 
    // the persona to a specific stock HeyGen Avatar ID.
    const avatarIdMap = {
        genius: "Wayne_20240711",
        confused: "Anna_public_3_20240108",
        skeptic: "Eric_public_pro2_20230608",
        summarizer: "Susan_public_2_20240128",
        quiz_master: "Tyler-incasual-20220721",
        organizer: "Gia-front-casual-20220818"
    };
    const avatarId = avatarIdMap[personaId] || "Wayne_20240711";
    
    // Connect to the specific avatar if not connected
    if (!avatarManager || !currentAvatarSessionInfo || currentAvatarSessionInfo.avatarId !== avatarId) {
        await connectAvatar(avatarId, personaId);
    }

    console.log(`Commanding ${personaId} to speak...`);
    
    // Command the Avatar to speak
    await avatarManager.speak({
        text: text,
        taskType: 'repeat' // Repeat the given text exactly
    });

    // Wait roughly the duration of the speech so the next agent doesn't interrupt too early
    // (A better way is listening for the avatar_stop_talking event, but this is a solid fallback)
    const estimatedDuration = (text.split(' ').length / 2.5) * 1000 + 1000; 
    await new Promise(r => setTimeout(r, estimatedDuration));
}

async function connectAvatar(avatarId, personaId) {
    console.log(`Connecting LiveAvatar SDK for ${personaId} (${avatarId})...`);

    // 1. Get Access Token from our backend proxy
    const response = await fetch('/avatar/token', { method: 'POST' });
    const data = await response.json();
    const token = data.token;

    // 2. Initialize HeyGen StreamingAvatar
    if (avatarManager) {
        try { await avatarManager.stopAvatar(); } catch (e) { }
    }
    
    avatarManager = new window.StreamingAvatarApi.StreamingAvatar({ token: token });

    // 3. Listen for Video Stream Event
    avatarManager.on('streamReady', (event) => {
        const remoteVideo = document.getElementById(`video-${personaId}`);
        if (remoteVideo) {
            remoteVideo.srcObject = event.detail;
            remoteVideo.classList.remove('hidden');
            remoteVideo.play().catch(console.error);
            
            // Hide the static placeholder image
            const cell = document.getElementById(`cell-${personaId}`);
            if (cell) cell.querySelector('.video-placeholder').style.opacity = '0';
        }
    });

    avatarManager.on('streamDisconnected', () => {
        console.log('Stream disconnected');
    });

    // 4. Start the Avatar Session
    currentAvatarSessionInfo = await avatarManager.createStartAvatar({
        quality: "low", // Keep response time fast for hackathon
        avatarName: avatarId,
        voice: {
            // Using standard ElevenLabs or Microsoft voices is mapped automatically if not specified, 
            // but we can specify the rate.
            rate: 1.0
        }
    });
    
    currentAvatarSessionInfo.avatarId = avatarId;
    console.log("Avatar connected!", currentAvatarSessionInfo);
}

function addMessage(speaker, text) {
    const isYou = speaker === 'you';
    const persona = state.personas[speaker] || { name: "Student", avatar: "👤" };

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isYou ? 'you' : ''}`;

    messageDiv.innerHTML = `
        <div class="message-header">
            <span class="message-avatar">${persona.avatar}</span>
            <span class="message-name">${persona.name}</span>
        </div>
        <div class="message-content">${text}</div>
    `;

    elements.messages.appendChild(messageDiv);
    elements.messages.scrollTop = elements.messages.scrollHeight;

    // Remove welcome message on first activity
    const welcome = document.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    // Track in state-level history for prompt building
    state.history.push(`${persona.name}: ${text}`);
}

function formatHistory() {
    return state.history.join("\n");
}

// ── Voice Logic (STT & TTS) ──────────────────────────────────────────

let recognition;
function initSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        console.warn("Speech recognition not supported in this browser.");
        elements.micBtn.style.display = 'none';
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
        state.isListening = true;
        elements.micBtn.classList.add('listening');
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        elements.userInput.value = transcript;
        sendMessage();
    };

    recognition.onerror = (event) => {
        console.error("Speech Recognition Error:", event.error);
        stopListening();
    };

    recognition.onend = () => {
        state.isListening = false;
        elements.micBtn.classList.remove('listening');
    };
}

function startListening() {
    if (state.isThinking || !recognition) return;
    try {
        recognition.start();
    } catch (e) {
        console.error("Recognition start error:", e);
    }
}

function stopListening() {
    if (recognition) recognition.stop();
}

async function playVoice(text, persona) {
    try {
        const response = await fetch('/tts/speak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, persona })
        });

        if (!response.ok) return;

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);

        return new Promise((resolve) => {
            audio.onended = resolve;
            audio.onerror = resolve;
            audio.play().catch(e => {
                console.warn("Audio playback blocked by browser/error:", e);
                resolve();
            });
        });
    } catch (error) {
        console.error("TTS Error:", error);
    }
}

// ── UI Helpers ──────────────────────────────────────────────────────
function showLoading(show) {
    elements.loadingOverlay.style.display = show ? 'flex' : 'none';
    if (show) {
        const phrases = ["Gathers the group...", "Genius is preparing...", "Skeptic is analyzing...", "Checking the facts..."];
        elements.loadingText.innerText = phrases[Math.floor(Math.random() * phrases.length)];
    }
}

function setPersonaState(personaId, status) {
    const cell = document.getElementById(`cell-${personaId}`);
    if (!cell) return;

    if (status === 'typing') cell.classList.add('typing');
    else cell.classList.remove('typing');
}

// ── Pomodoro Logic ──────────────────────────────────────────────────
function togglePomodoro() {
    if (state.pomodoro.isActive) {
        clearInterval(state.pomodoro.timer);
        state.pomodoro.isActive = false;
        elements.pomodoroBtn.innerText = '▶';
    } else {
        state.pomodoro.isActive = true;
        elements.pomodoroBtn.innerText = '⏸';
        state.pomodoro.timer = setInterval(updatePomodoro, 1000);
    }
}

function updatePomodoro() {
    state.pomodoro.timeLeft--;

    if (state.pomodoro.timeLeft <= 0) {
        clearInterval(state.pomodoro.timer);
        state.pomodoro.isActive = false;
        state.pomodoro.timeLeft = 25 * 60;
        elements.pomodoroBtn.innerText = '▶';
        notifyPomodoroEnd();
    }

    const minutes = Math.floor(state.pomodoro.timeLeft / 60);
    const seconds = state.pomodoro.timeLeft % 60;
    elements.pomodoroTime.innerText = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    const progress = (state.pomodoro.timeLeft / (25 * 60)) * 100;
    elements.pomodoroFill.style.strokeDasharray = `${progress}, 100`;
}

function notifyPomodoroEnd() {
    addMessage('organizer', "Time's up! Great focus. Let's take a 5-minute break. Stand up, stretch, and get some water. 🥤");

    if (state.isVoiceEnabled) {
        playVoice("Time's up! Great focus. Let's take a five minute break.", "organizer");
    }
}
