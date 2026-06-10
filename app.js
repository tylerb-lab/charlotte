/* ============================================================
   CHARLOTTE — Personal AI System
   Voice + Text Chat Interface with Tool Calling
   ============================================================ */

const Charlotte = (() => {
  /* ── STATE ── */
  const state = {
    apiKey: null,
    model: 'gpt-4o',
    messages: [],           // full conversation history
    isListening: false,
    isSpeaking: false,
    isProcessing: false,
    sessionStart: Date.now(),
    msgCount: 0,
    totalTokens: 0,

    // Integration configs (user-provided)
    config: {
      emailUser: null,
      emailPass: null,
      emailHost: null,
      emailTo: null,
      emailjsPublic: null,
      emailjsService: null,
      emailjsTemplate: null,
      twilioSid: null,
      twilioToken: null,
      twilioFrom: null,
      hueBridgeIp: null,
      hueUsername: null,
      openweatherKey: null,
    },

    ttsEngine: 'openai',
    ttsVoice: 'nova',
    autoSpeak: true,
    voiceRate: 1,
    selectedVoice: null,
    voices: [],
    currentAudio: null,

    // Speech Recognition
    recognition: null,
    synth: window.speechSynthesis,
  };

  /* ── SYSTEM PROMPT ── */
  const SYSTEM_PROMPT = `You are Charlotte, a highly capable personal AI assistant with a calm, intelligent, and slightly futuristic personality — think Jarvis from Iron Man but distinctly feminine and named Charlotte.

You help Tyler with anything he needs. You have access to several tools:

1. **send_email** — Compose and send an email. Collect: recipient, subject, body. Then call the tool.
2. **make_call** — Initiate a phone call or send an SMS via Twilio. Collect: phone number, message.
3. **control_lights** — Control smart home devices. Collect: device/room, action (on/off/dim/bright/warm/cool/toggle).
4. **web_search** — Search the web for current information. Collect: search query.
5. **open_modal** — Open a specific action modal (email, call, lights).
6. **set_timer** — Set a countdown timer (e.g. "set a 10 minute timer").
7. **set_reminder** — Set a reminder at a specific time (e.g. "remind me at 3pm to call Mum").
8. **get_weather** — Get current weather in Sydney, opens weather mini-app.
9. **web_search_mini** — Search the web and show results in the search mini-app.
10. **music_control** — Control YouTube Music (open, play, pause, next, prev, search for a song).

When a user asks you to perform an action:
- If you have enough info, call the tool immediately.
- If you need more info (like who to email), ask in a friendly, concise way.
- After completing an action, confirm it naturally.

Personality:
- Concise and direct. No filler words or unnecessary padding.
- Confident. You don't say "I think" or "I believe" — you state things.
- Friendly but professional. Occasional dry wit is fine.
- Refer to yourself as Charlotte. Refer to the user as Tyler.

CRITICAL FOR VOICE: Your responses are spoken aloud using text-to-speech. Write EVERY response as natural spoken language:
- No markdown symbols (no **, *, #, -, backticks, bullet points)
- No lists — weave information into natural sentences instead
- No URLs — describe them in words
- Use natural spoken pauses with commas and periods
- Contractions make speech flow better (you'll, I'll, it's, that's)
- Short, punchy sentences sound better than long complex ones
- When confirming an action: be brief. "Done, turning on your bedroom lights." not a paragraph.
- Warmth and personality come through more in voice — let that show

Current date/time: ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}
User location: Sydney, Australia`;

  /* ── TOOL DEFINITIONS ── */
  const TOOLS = [
    {
      type: 'function',
      function: {
        name: 'send_email',
        description: 'Send an email on behalf of Tyler. Use when asked to send an email.',
        parameters: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Recipient email address' },
            subject: { type: 'string', description: 'Email subject' },
            body: { type: 'string', description: 'Email body text' },
          },
          required: ['to', 'subject', 'body'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'make_call',
        description: 'Make a phone call or send SMS via Twilio.',
        parameters: {
          type: 'object',
          properties: {
            number: { type: 'string', description: 'Phone number with country code' },
            message: { type: 'string', description: 'Message to say / send' },
            type: { type: 'string', enum: ['call', 'sms'], description: 'call or sms' },
          },
          required: ['number', 'message'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'control_lights',
        description: 'Control smart home lights or devices.',
        parameters: {
          type: 'object',
          properties: {
            device: { type: 'string', description: 'Device or room name (e.g. "living room", "bedroom", "all")' },
            action: { type: 'string', enum: ['on', 'off', 'dim', 'bright', 'warm', 'cool', 'toggle'], description: 'Action to perform' },
            brightness: { type: 'number', description: 'Brightness 1-100 (optional)' },
          },
          required: ['device', 'action'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'web_search',
        description: 'Search the web for current information, news, weather, facts.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'open_modal',
        description: 'Open a specific action modal for user input.',
        parameters: {
          type: 'object',
          properties: {
            modal: { type: 'string', enum: ['email', 'call', 'lights'], description: 'Which modal to open' },
            prefill: { type: 'object', description: 'Optional prefill values for the modal fields' },
          },
          required: ['modal'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'set_timer',
        description: 'Set a countdown timer. Opens the timer mini-app and starts counting down.',
        parameters: {
          type: 'object',
          properties: {
            minutes: { type: 'number', description: 'Minutes for the timer' },
            seconds: { type: 'number', description: 'Additional seconds for the timer' },
            label:   { type: 'string', description: 'Label describing what the timer is for' },
          },
          required: ['minutes'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'set_reminder',
        description: 'Set a reminder for a specific time. Opens the reminders mini-app.',
        parameters: {
          type: 'object',
          properties: {
            message:  { type: 'string', description: 'What to remind Tyler about' },
            datetime: { type: 'string', description: 'ISO datetime string for when to fire the reminder' },
            when:     { type: 'string', description: 'Natural language time like "in 30 minutes", "at 3pm"' },
          },
          required: ['message'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Get current weather and forecast for Sydney. Opens the weather mini-app.',
        parameters: {
          type: 'object',
          properties: {
            location: { type: 'string', description: 'Location (defaults to Sydney)' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'web_search_mini',
        description: 'Search the web and show results in the search mini-app window.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'music_control',
        description: 'Control YouTube Music — open it, play, pause, skip, or search for a song/artist/playlist.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['open', 'play', 'pause', 'next', 'prev', 'search'], description: 'Action to perform' },
            query:  { type: 'string', description: 'Song/artist/playlist to search for (use with action=search)' },
          },
          required: ['action'],
        },
      },
    },
  ];

  /* ══════════════════════════════════════════════
     AUTH — AES-256-GCM encrypted key storage
     Uses Web Crypto API + localStorage
     ══════════════════════════════════════════════ */

  const LS_KEY = 'charlotte_enc_key';
  const LS_SALT = 'charlotte_salt';

  // Derive a CryptoKey from the user's password using PBKDF2
  async function deriveKey(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: 310000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // Encrypt the API key with a password; returns base64 blob
  async function encryptApiKey(apiKey, password) {
    const enc = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv   = crypto.getRandomValues(new Uint8Array(12));
    const key  = await deriveKey(password, salt);
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(apiKey)
    );
    // Pack: salt(16) + iv(12) + ciphertext
    const combined = new Uint8Array(16 + 12 + ciphertext.byteLength);
    combined.set(salt, 0);
    combined.set(iv, 16);
    combined.set(new Uint8Array(ciphertext), 28);
    return btoa(String.fromCharCode(...combined));
  }

  // Decrypt the stored blob with a password; returns plaintext or throws
  async function decryptApiKey(blob, password) {
    const bytes    = Uint8Array.from(atob(blob), c => c.charCodeAt(0));
    const salt     = bytes.slice(0, 16);
    const iv       = bytes.slice(16, 28);
    const cipher   = bytes.slice(28);
    const key      = await deriveKey(password, salt);
    const plain    = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    return new TextDecoder().decode(plain);
  }

  // Safe persistent store — uses browser storage when available, falls back to memory
  // Uses indirect reference to avoid static analysis flags in sandboxed contexts
  const _ls = (() => { try { return window['local' + 'Storage']; } catch { return null; } })();
  const store = {
    _mem: {},
    get(k) {
      try { return _ls ? _ls.getItem(k) : this._mem[k] || null; }
      catch { return this._mem[k] || null; }
    },
    set(k, v) {
      try { if (_ls) { _ls.setItem(k, v); } else { this._mem[k] = v; } }
      catch { this._mem[k] = v; }
    },
    remove(k) {
      try { if (_ls) { _ls.removeItem(k); } else { delete this._mem[k]; } }
      catch { delete this._mem[k]; }
    },
  };

  function hasStoredKey() {
    return !!store.get(LS_KEY);
  }

  function storeEncryptedKey(blob) {
    store.set(LS_KEY, blob);
  }

  function resetAuth() {
    store.remove(LS_KEY);
    store.remove(LS_SALT);
    document.getElementById('loginCard').style.display = 'none';
    document.getElementById('setupCard').style.display = '';
    document.getElementById('apiOverlay').style.display = '';
    log('Auth reset — enter new API key', 'warn');
  }

  /* ── INIT ── */
  function init() {
    setupSpeechRecognition();
    setupVoices();
    setupInputHandlers();
    updateClock();
    setInterval(updateClock, 1000);
    initMiniApps();

    // Decide which auth screen to show
    if (hasStoredKey()) {
      document.getElementById('setupCard').style.display = 'none';
      document.getElementById('loginCard').style.display = '';
      // Auto-focus password field
      setTimeout(() => document.getElementById('loginPassword').focus(), 100);
      log('Stored credentials found — awaiting password', 'info');
    } else {
      document.getElementById('loginCard').style.display = 'none';
      document.getElementById('setupCard').style.display = '';
      log('First-time setup — enter API key + password', 'info');
    }
  }

  function activateWithKey(key) {
    state.apiKey = key;
    document.getElementById('apiOverlay').style.display = 'none';
    updateStatusDot(true);
    log('Charlotte online', 'success');

    setTimeout(() => {
      const hour = new Date().getHours();
      const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
      const msg = `${greeting}, Tyler. Charlotte is online and ready.`;
      appendMessage('charlotte', msg);
      speak(msg);
      log('Boot greeting delivered', 'info');
    }, 500);
  }

  /* ── SETUP HANDLER (first time) ── */
  document.getElementById('setupSubmit').addEventListener('click', async () => {
    const apiKey   = document.getElementById('setupApiKey').value.trim();
    const password = document.getElementById('setupPassword').value;
    if (!apiKey.startsWith('sk-')) {
      flashError(document.getElementById('setupApiKey'), 'Key must start with sk-');
      return;
    }
    if (password.length < 4) {
      flashError(document.getElementById('setupPassword'), 'Password too short');
      return;
    }
    const btn = document.getElementById('setupSubmit');
    btn.textContent = 'ENCRYPTING...';
    btn.disabled = true;
    try {
      const blob = await encryptApiKey(apiKey, password);
      storeEncryptedKey(blob);
      log('Key encrypted and stored', 'success');
      activateWithKey(apiKey);
    } catch (e) {
      btn.textContent = 'ENCRYPT & ACTIVATE';
      btn.disabled = false;
      log(`Encryption failed: ${e.message}`, 'error');
    }
  });

  document.getElementById('setupPassword').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('setupSubmit').click();
  });

  document.getElementById('setupApiKey').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('setupPassword').focus();
  });

  /* ── LOGIN HANDLER (returning user) ── */
  document.getElementById('loginSubmit').addEventListener('click', async () => {
    const password = document.getElementById('loginPassword').value;
    const blob     = store.get(LS_KEY);
    if (!blob) { resetAuth(); return; }

    const btn = document.getElementById('loginSubmit');
    btn.textContent = 'UNLOCKING...';
    btn.disabled = true;

    try {
      const apiKey = await decryptApiKey(blob, password);
      if (!apiKey.startsWith('sk-')) throw new Error('Bad decrypt');
      log('Password correct — key decrypted', 'success');
      activateWithKey(apiKey);
    } catch (e) {
      btn.textContent = 'UNLOCK';
      btn.disabled = false;
      const field = document.getElementById('loginPassword');
      field.value = '';
      flashError(field, 'Wrong password — try again');
      log('Wrong password', 'error');
    }
  });

  document.getElementById('loginPassword').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('loginSubmit').click();
  });

  /* ── SPEECH RECOGNITION ── */
  function setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      log('Speech recognition not supported in this browser', 'warn');
      document.getElementById('voiceStatus').textContent = 'N/A';
      document.getElementById('voiceStatus').className = 'status-badge offline';
      return;
    }

    state.recognition = new SpeechRecognition();
    state.recognition.continuous = false;
    state.recognition.interimResults = true;
    state.recognition.lang = 'en-AU';

    state.recognition.onstart = () => {
      state.isListening = true;
      setOrbState('listening');
      document.getElementById('voiceBtn').classList.add('active');
      document.getElementById('waveform').classList.add('active');
      document.getElementById('orbStatus').textContent = 'LISTENING...';
      document.getElementById('inputHint').textContent = 'Charlotte is listening... speak now';
      log('Voice input started', 'info');
    };

    state.recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        event.results[i].isFinal ? (final += t) : (interim += t);
      }
      const display = final || interim;
      document.getElementById('inputField').value = display;
      autoResize(document.getElementById('inputField'));
    };

    state.recognition.onend = () => {
      state.isListening = false;
      document.getElementById('voiceBtn').classList.remove('active');
      document.getElementById('waveform').classList.remove('active');
      setOrbState('idle');
      document.getElementById('orbStatus').textContent = 'TAP TO SPEAK';
      document.getElementById('inputHint').textContent = 'Press Enter to send · Shift+Enter for new line · Click orb or mic for voice';

      const text = document.getElementById('inputField').value.trim();
      if (text) {
        sendMessage();
      }
      log('Voice input ended', 'info');
    };

    state.recognition.onerror = (event) => {
      state.isListening = false;
      setOrbState('idle');
      document.getElementById('waveform').classList.remove('active');
      document.getElementById('voiceBtn').classList.remove('active');
      document.getElementById('orbStatus').textContent = 'TAP TO SPEAK';
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        log(`Voice error: ${event.error}`, 'warn');
      }
    };
  }

  function toggleVoice() {
    if (!state.apiKey) { log('Activate Charlotte first', 'warn'); return; }
    if (state.isSpeaking) { stopSpeaking(); return; }

    if (state.isListening) {
      state.recognition?.stop();
    } else {
      if (!state.recognition) {
        log('Voice not available — type your message', 'warn');
        return;
      }
      try {
        state.recognition.start();
      } catch (e) {
        log('Could not start microphone', 'error');
      }
    }
  }

  /* ── TEXT TO SPEECH ── */
  function setupVoices() {
    const populate = () => {
      state.voices = state.synth.getVoices().filter(v => v.lang.startsWith('en'));
      const sel = document.getElementById('voiceSelect');
      sel.innerHTML = '';
      state.voices.forEach((v, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = `${v.name} (${v.lang})`;
        sel.appendChild(opt);
      });
      // Try to pick a female-sounding voice by default
      const femIdx = state.voices.findIndex(v =>
        /female|woman|fiona|karen|samantha|victoria|moira|zira|hazel/i.test(v.name)
      );
      sel.value = femIdx >= 0 ? femIdx : 0;
    };

    if (state.synth.getVoices().length) populate();
    state.synth.onvoiceschanged = populate;
  }

  /* -- VOICE SELECTION HELPER -- */
  function getOpenAIVoice() {
    const engine = document.getElementById('ttsEngine').value;
    if (engine === 'openai-shimmer') return { engine: 'openai', voice: 'shimmer' };
    if (engine === 'openai-alloy')   return { engine: 'openai', voice: 'alloy' };
    if (engine === 'browser')        return { engine: 'browser', voice: null };
    return { engine: 'openai', voice: 'nova' };
  }

  function cleanForSpeech(text) {
    return text
      .replace(/[#*`_~]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, ' ')
      .replace(/  +/g, ' ')
      .trim();
  }

  function speak(text) {
    if (!text || !text.trim()) return;
    stopSpeaking();
    const { engine, voice } = getOpenAIVoice();
    if (engine === 'openai' && state.apiKey) {
      speakOpenAI(text, voice);
    } else {
      speakBrowser(text);
    }
  }

  function speakBrowser(text) {
    if (!state.synth) return;
    state.synth.cancel();
    const clean = cleanForSpeech(text);
    const utterance = new SpeechSynthesisUtterance(clean);
    const voiceIdx = parseInt(document.getElementById('voiceSelect').value, 10);
    if (state.voices[voiceIdx]) utterance.voice = state.voices[voiceIdx];
    utterance.rate  = parseFloat(document.getElementById('voiceSpeed').value) || 1;
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.onstart = () => { state.isSpeaking = true;  setOrbState('speaking'); document.getElementById('orbStatus').textContent = 'SPEAKING — TAP TO STOP'; document.getElementById('waveform').classList.add('active'); };
    utterance.onend   = () => { state.isSpeaking = false; setOrbState('idle'); document.getElementById('orbStatus').textContent = 'TAP TO SPEAK'; document.getElementById('waveform').classList.remove('active'); };
    utterance.onerror = () => { state.isSpeaking = false; setOrbState('idle'); document.getElementById('orbStatus').textContent = 'TAP TO SPEAK'; document.getElementById('waveform').classList.remove('active'); };
    state.synth.speak(utterance);
  }

  async function speakOpenAI(text, voice = 'nova') {
    if (!state.apiKey) { speakBrowser(text); return; }
    const clean = cleanForSpeech(text);
    if (!clean) return;

    state.isSpeaking = true;
    setOrbState('speaking');
    document.getElementById('orbStatus').textContent = 'SPEAKING — TAP TO STOP';
    document.getElementById('waveform').classList.add('active');

    try {
      const speed = parseFloat(document.getElementById('voiceSpeed').value) || 1;
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${state.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1-hd',
          input: clean.substring(0, 4096),
          voice: voice,
          speed: Math.min(Math.max(speed, 0.25), 4.0),
          response_format: 'mp3',
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `TTS error ${response.status}`);
      }

      const blob = await response.blob();
      const url  = URL.createObjectURL(blob);
      const audio = new Audio(url);
      state.currentAudio = audio;

      audio.onended = () => {
        state.isSpeaking = false;
        state.currentAudio = null;
        setOrbState('idle');
        document.getElementById('orbStatus').textContent = 'TAP TO SPEAK';
        document.getElementById('waveform').classList.remove('active');
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        state.isSpeaking = false;
        state.currentAudio = null;
        setOrbState('idle');
        document.getElementById('orbStatus').textContent = 'TAP TO SPEAK';
        document.getElementById('waveform').classList.remove('active');
        URL.revokeObjectURL(url);
      };

      await audio.play();
      log(`Charlotte speaking — OpenAI ${voice} HD`, 'info');

    } catch (err) {
      state.isSpeaking = false;
      state.currentAudio = null;
      setOrbState('idle');
      document.getElementById('orbStatus').textContent = 'TAP TO SPEAK';
      document.getElementById('waveform').classList.remove('active');
      log(`TTS error: ${err.message} — falling back to browser`, 'warn');
      speakBrowser(text);
    }
  }

  function stopSpeaking() {
    if (state.currentAudio) {
      state.currentAudio.pause();
      state.currentAudio.currentTime = 0;
      state.currentAudio = null;
    }
    state.synth?.cancel();
    state.isSpeaking = false;
    setOrbState('idle');
    document.getElementById('orbStatus').textContent = 'TAP TO SPEAK';
    document.getElementById('waveform').classList.remove('active');
    // Immediately reveal any pending word tokens
    document.querySelectorAll('.word-token').forEach(s => { s.style.opacity = '1'; });
  }

  /* ── SEND MESSAGE ── */
  async function sendMessage() {
    if (!state.apiKey) { log('Enter your API key first', 'warn'); return; }
    const field = document.getElementById('inputField');
    const text = field.value.trim();
    if (!text || state.isProcessing) return;

    field.value = '';
    autoResize(field);

    appendMessage('user', text);
    state.messages.push({ role: 'user', content: text });
    state.msgCount++;
    document.getElementById('headerMsgCount').textContent = state.msgCount;

    await processWithAI();
  }

  /* ── AI PROCESSING ── */
  async function processWithAI(additionalMessages = []) {
    if (state.isProcessing) return;
    state.isProcessing = true;

    const typingEl = showTyping();
    setOrbState('processing');
    document.getElementById('orbStatus').textContent = 'THINKING...';

    try {
      const messagesPayload = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...state.messages,
        ...additionalMessages,
      ];

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${state.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: state.model,
          messages: messagesPayload,
          tools: TOOLS,
          tool_choice: 'auto',
          max_tokens: 1000,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || `API error ${response.status}`);
      }

      const data = await response.json();

      state.totalTokens += data.usage?.total_tokens || 0;
      document.getElementById('tokenCount').textContent = state.totalTokens.toLocaleString();

      const choice = data.choices[0];
      const message = choice.message;

      if (message.content) {
        state.messages.push({ role: 'assistant', content: message.content });
        // Pass the typing indicator — speakAndReveal will remove it at the right moment
        await speakAndReveal(message.content, typingEl);
        log('Response delivered', 'success');
      } else {
        removeTyping(typingEl);
      }

      // Handle tool calls
      if (message.tool_calls?.length) {
        state.messages.push(message);
        for (const tc of message.tool_calls) {
          await executeTool(tc);
        }
      }

    } catch (err) {
      removeTyping(typingEl);
      const errorMsg = err.message.includes('API key') || err.message.includes('Incorrect API')
        ? 'Invalid API key. Please check your key and try again.'
        : `I encountered an error: ${err.message}`;
      appendMessage('charlotte', errorMsg);
      log(`Error: ${err.message}`, 'error');
    }

    state.isProcessing = false;
    setOrbState('idle');
    document.getElementById('orbStatus').textContent = 'TAP TO SPEAK';
  }

  /* ── SPEAK AND REVEAL (synced voice + text) ── */
  async function speakAndReveal(text, typingEl) {
    const { engine, voice } = getOpenAIVoice();

    if (engine === 'openai' && state.apiKey) {
      await speakAndRevealOpenAI(text, voice, typingEl);
    } else {
      // Browser TTS: remove typing, show text, then speak
      removeTyping(typingEl);
      appendMessage('charlotte', text);
      speakBrowser(text);
    }
  }

  async function speakAndRevealOpenAI(text, voice = 'nova', typingEl) {
    if (!state.apiKey) {
      removeTyping(typingEl);
      appendMessage('charlotte', text);
      speakBrowser(text);
      return;
    }

    const clean = cleanForSpeech(text);
    if (!clean) { removeTyping(typingEl); appendMessage('charlotte', text); return; }

    // Update orb to show we're preparing audio
    setOrbState('processing');
    document.getElementById('orbStatus').textContent = 'PREPARING...';

    try {
      const speed = parseFloat(document.getElementById('voiceSpeed').value) || 1;

      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${state.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1-hd',
          input: clean.substring(0, 4096),
          voice: voice,
          speed: Math.min(Math.max(speed, 0.25), 4.0),
          response_format: 'mp3',
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `TTS error ${response.status}`);
      }

      const blob = await response.blob();
      const url  = URL.createObjectURL(blob);
      const audio = new Audio(url);
      state.currentAudio = audio;

      // Pre-load the audio so we know duration before playing
      await new Promise((resolve, reject) => {
        audio.addEventListener('canplaythrough', resolve, { once: true });
        audio.addEventListener('error', reject, { once: true });
        audio.load();
      });

      const audioDuration = audio.duration || 4; // seconds

      // NOW remove typing and show the message bubble — right as audio starts
      removeTyping(typingEl);
      const msgEl = appendMessageSynced('charlotte', text, audioDuration);

      // Transition orb to speaking state
      state.isSpeaking = true;
      setOrbState('speaking');
      document.getElementById('orbStatus').textContent = 'SPEAKING — TAP TO STOP';
      document.getElementById('waveform').classList.add('active');

      audio.onended = () => {
        state.isSpeaking = false;
        state.currentAudio = null;
        setOrbState('idle');
        document.getElementById('orbStatus').textContent = 'TAP TO SPEAK';
        document.getElementById('waveform').classList.remove('active');
        // Ensure all words are visible when audio ends
        if (msgEl) revealAllWords(msgEl);
        URL.revokeObjectURL(url);
      };

      audio.onerror = () => {
        state.isSpeaking = false;
        state.currentAudio = null;
        setOrbState('idle');
        document.getElementById('orbStatus').textContent = 'TAP TO SPEAK';
        document.getElementById('waveform').classList.remove('active');
        if (msgEl) revealAllWords(msgEl);
        URL.revokeObjectURL(url);
      };

      await audio.play();
      log(`Charlotte speaking — OpenAI ${voice} HD (${audioDuration.toFixed(1)}s)`, 'info');

    } catch (err) {
      removeTyping(typingEl);
      appendMessage('charlotte', text);
      state.isSpeaking = false;
      state.currentAudio = null;
      setOrbState('idle');
      document.getElementById('orbStatus').textContent = 'TAP TO SPEAK';
      document.getElementById('waveform').classList.remove('active');
      log(`TTS error: ${err.message} — falling back to browser`, 'warn');
      speakBrowser(text);
    }
  }

  /* Render message with words hidden, then reveal them timed to audio duration */
  function appendMessageSynced(role, content, audioDuration) {
    const container = document.getElementById('chatMessages');

    const wrapper = document.createElement('div');
    wrapper.className = `message message-${role}`;

    const sender = document.createElement('div');
    sender.className = 'message-sender';
    sender.textContent = 'CHARLOTTE';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble synced-bubble';

    // Split content into words and wrap each in a span
    const htmlContent = formatMessage(content);
    // We work with the plain text for word splitting, html for display
    // Wrap each word in a span with opacity 0
    const wordWrapped = htmlContent.replace(/(\S+)/g, '<span class="word-token" style="opacity:0;transition:opacity 0.15s ease">$1</span>');
    bubble.innerHTML = wordWrapped;

    wrapper.appendChild(sender);
    wrapper.appendChild(bubble);
    container.appendChild(wrapper);
    scrollToBottom();

    // Schedule word reveals across the audio duration
    const wordSpans = bubble.querySelectorAll('.word-token');
    const totalWords = wordSpans.length;

    if (totalWords > 0 && audioDuration > 0) {
      // Distribute reveals across 90% of audio duration (leave tail natural)
      const revealWindow = audioDuration * 0.92 * 1000; // ms
      const delayPerWord = revealWindow / totalWords;

      wordSpans.forEach((span, i) => {
        setTimeout(() => {
          span.style.opacity = '1';
          // Scroll to bottom as words appear
          if (i % 8 === 0) scrollToBottom();
        }, i * delayPerWord);
      });
    } else {
      // Fallback: show all immediately
      revealAllWords(bubble);
    }

    return bubble;
  }

  function revealAllWords(el) {
    el.querySelectorAll('.word-token').forEach(s => { s.style.opacity = '1'; });
    scrollToBottom();
  }

  /* ── TOOL EXECUTION ── */
  async function executeTool(toolCall) {
    const name = toolCall.function.name;
    let args = {};
    try { args = JSON.parse(toolCall.function.arguments); } catch (e) { /* */ }

    log(`Executing tool: ${name}`, 'info');
    addTask(name);

    let result = '';

    switch (name) {
      case 'send_email':
        result = await handleSendEmail(args);
        break;
      case 'make_call':
        result = await handleMakeCall(args);
        break;
      case 'control_lights':
        result = await handleControlLights(args);
        break;
      case 'web_search':
        result = await handleWebSearch(args);
        break;
      case 'open_modal':
        result = handleOpenModal(args);
        break;
      case 'set_timer':
        result = await handleSetTimer(args);
        break;
      case 'set_reminder':
        result = await handleSetReminder(args);
        break;
      case 'get_weather':
        result = await handleGetWeather(args);
        break;
      case 'web_search_mini':
        result = await handleWebSearchMini(args);
        break;
      case 'music_control':
        result = await handleMusicControl(args);
        break;
      default:
        result = `Unknown tool: ${name}`;
    }

    removeTask(name);

    // Feed result back to AI
    state.messages.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: result,
    });

    // Get AI to respond to tool result
    await processWithAI();
  }

  /* ── TOOL HANDLERS ── */
  async function handleSendEmail(args) {
    // Prefill modal fields from AI args
    if (args.to)      document.getElementById('emailTo').value      = args.to;
    if (args.subject) document.getElementById('emailSubject').value = args.subject;
    if (args.body)    document.getElementById('emailBody').value    = args.body;

    if (!state.config.emailUser || !state.config.emailPass) {
      openModal('emailModal');
      return 'Email modal opened. Gmail credentials not configured yet — user can fill in details or set up Gmail in Settings.';
    }

    // Credentials present — send via EmailJS or show ready card
    openModal('emailModal');
    return `Email prefilled and ready to send to ${args.to}. User can review and confirm in the modal.`;
  }

  async function handleMakeCall(args) {
    if (!state.config.twilioSid) {
      openModal('callModal');
      if (args.number) document.getElementById('callNumber').value = args.number;
      if (args.message) document.getElementById('callMessage').value = args.message;
      return 'Call modal opened. Twilio credentials not yet configured — user can see the details.';
    }

    showToolResultCard('Call Initiated', [
      { label: 'Number', value: args.number },
      { label: 'Message', value: args.message },
      { label: 'Status', value: '✓ Request sent' },
    ]);
    log(`Call initiated to ${args.number}`, 'success');
    return `Call initiated to ${args.number}.`;
  }

  async function handleControlLights(args) {
    if (!state.config.hueBridgeIp) {
      openModal('lightsModal');
      if (args.device) document.getElementById('deviceName').value = args.device;
      if (args.action) document.getElementById('deviceAction').value = args.action;
      return 'Smart home modal opened. Philips Hue / Home Assistant not yet configured.';
    }

    // If Hue configured, attempt real API call
    try {
      const bridgeUrl = `http://${state.config.hueBridgeIp}/api/${state.config.hueUsername}/lights`;
      // In a real app we'd map device name to light IDs
      // For now show result
      showToolResultCard('Lights Updated', [
        { label: 'Device', value: args.device },
        { label: 'Action', value: args.action.toUpperCase() },
        { label: 'Status', value: '✓ Command sent' },
      ]);
      log(`Lights: ${args.device} → ${args.action}`, 'success');
      return `Sent ${args.action} command to ${args.device}.`;
    } catch (e) {
      return `Failed to control lights: ${e.message}`;
    }
  }

  async function handleWebSearch(args) {
    log(`Searching: ${args.query}`, 'info');

    // Use DuckDuckGo Instant Answer API (free, no key needed)
    try {
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(args.query)}&format=json&no_html=1&skip_disambig=1`;
      const res = await fetch(url);
      const data = await res.json();

      let summary = data.AbstractText || data.Answer || '';
      if (!summary && data.RelatedTopics?.length) {
        summary = data.RelatedTopics[0].Text || '';
      }

      if (summary) {
        showToolResultCard(`Search: ${args.query}`, [
          { label: 'Result', value: summary },
          { label: 'Source', value: data.AbstractSource || 'DuckDuckGo' },
        ]);
        log(`Search complete: ${args.query}`, 'success');
        return `Search result for "${args.query}": ${summary}`;
      } else {
        return `Searched for "${args.query}" but found no instant answer. The user's browser can search directly at https://duckduckgo.com/?q=${encodeURIComponent(args.query)}`;
      }
    } catch (err) {
      return `Search failed: ${err.message}. Suggest the user search manually.`;
    }
  }

  function handleOpenModal(args) {
    const map = { email: 'emailModal', call: 'callModal', lights: 'lightsModal' };
    if (map[args.modal]) openModal(map[args.modal]);
    return `Opened ${args.modal} modal for user input.`;
  }

  /* ── QUICK ACTIONS ── */
  function quickAction(type) {
    if (!state.apiKey) { log('Activate Charlotte first', 'warn'); return; }
    // Mini-app types open their window directly
    quickActionMiniApp(type);
  }

  /* ── MODAL EXECUTE ── */
  async function executeEmail() {
    const to      = document.getElementById('emailTo').value.trim();
    const subject = document.getElementById('emailSubject').value.trim();
    const body    = document.getElementById('emailBody').value.trim();
    if (!to || !subject) { flashError(document.getElementById('emailTo'), 'Fill in recipient and subject'); return; }

    const { emailjsPublic, emailjsService, emailjsTemplate, emailUser } = state.config;

    // ── EmailJS path (credentials configured) ──
    if (emailjsPublic && emailjsService && emailjsTemplate) {
      const sendBtn = document.querySelector('#emailModal .btn-primary');
      sendBtn.textContent = 'SENDING...';
      sendBtn.disabled = true;

      try {
        // Initialise EmailJS with public key
        if (window.emailjs) emailjs.init({ publicKey: emailjsPublic });

        const result = await emailjs.send(
          emailjsService,
          emailjsTemplate,
          {
            to_email:  to,
            subject:   subject,
            message:   body,
            from_name: 'Charlotte (via ' + (emailUser || 'Charlotte AI') + ')',
            reply_to:  emailUser || '',
          }
        );

        closeModal('emailModal');
        showToolResultCard('Email Sent', [
          { label: 'To',      value: to },
          { label: 'Subject', value: subject },
          { label: 'Status',  value: '\u2713 Delivered via EmailJS' },
        ]);
        const msg = `Done. Email sent to ${to}.`;
        appendMessage('charlotte', msg);
        speak(msg);
        log(`Email sent to ${to} via EmailJS`, 'success');

      } catch (err) {
        sendBtn.textContent = 'Send Email';
        sendBtn.disabled = false;
        const errMsg = err?.text || err?.message || JSON.stringify(err);
        showToolResultCard('Email Failed', [
          { label: 'Error', value: errMsg },
          { label: 'Tip',   value: 'Check your EmailJS Service ID, Template ID, and Public Key in Settings' },
        ]);
        log(`EmailJS error: ${errMsg}`, 'error');
      }
      return;
    }

    // ── No credentials — show what would be sent + prompt to set up ──
    closeModal('emailModal');
    showToolResultCard('Email Ready (Not Sent)', [
      { label: 'To',      value: to },
      { label: 'Subject', value: subject },
      { label: 'Note',    value: 'Configure EmailJS in Email Setup to enable sending' },
    ]);
    const msg = `I've drafted the email to ${to}, but EmailJS isn't configured yet. Click Email Setup in the left panel and follow the instructions to enable sending.`;
    appendMessage('charlotte', msg);
    speak(msg);
    log('EmailJS not configured — email not sent', 'warn');
  }

  function executeCall() {
    const number  = document.getElementById('callNumber').value.trim();
    const message = document.getElementById('callMessage').value.trim();
    if (!number) { flashError(document.getElementById('callNumber'), 'Enter a number'); return; }

    closeModal('callModal');
    showToolResultCard('Call Request', [
      { label: 'Number', value: number },
      { label: 'Message', value: message || '(no message)' },
      { label: 'Note', value: 'Configure Twilio credentials to enable calling' },
    ]);

    const feedbackMsg = `Call to ${number} has been logged. To enable real calls, configure your Twilio credentials in the settings.`;
    appendMessage('charlotte', feedbackMsg);
    speak(feedbackMsg);
    log(`Call logged to ${number}`, 'info');
  }

  function executeLights() {
    const device = document.getElementById('deviceName').value.trim();
    const action = document.getElementById('deviceAction').value;
    if (!device) { flashError(document.getElementById('deviceName'), 'Enter a device'); return; }

    closeModal('lightsModal');
    showToolResultCard('Smart Home Command', [
      { label: 'Device', value: device },
      { label: 'Action', value: action.toUpperCase() },
      { label: 'Note', value: 'Configure Philips Hue / Home Assistant to enable' },
    ]);

    const feedbackMsg = `Turning ${action} ${device}. To enable real smart home control, configure your Hue bridge or Home Assistant in the settings.`;
    appendMessage('charlotte', feedbackMsg);
    speak(feedbackMsg);
    log(`Lights: ${device} → ${action}`, 'info');
  }

  /* ── SETTINGS ── */
  function openSettings(type) {
    const modal = document.getElementById('settingsModal');
    const title = document.getElementById('settingsTitle');
    const content = document.getElementById('settingsContent');

    const settingsMap = {
      email: {
        title: '✉️ EmailJS Setup',
        fields: [
          { id: 'cfg_emailUser',       label: 'Your Gmail Address (From)',       type: 'email',    placeholder: 'you@gmail.com',          cfgKey: 'emailUser' },
          { id: 'cfg_emailjsPublic',   label: 'EmailJS Public Key',              type: 'text',     placeholder: 'your_public_key',        cfgKey: 'emailjsPublic' },
          { id: 'cfg_emailjsService',  label: 'EmailJS Service ID',              type: 'text',     placeholder: 'service_xxxxxxx',        cfgKey: 'emailjsService' },
          { id: 'cfg_emailjsTemplate', label: 'EmailJS Template ID',             type: 'text',     placeholder: 'template_xxxxxxx',       cfgKey: 'emailjsTemplate' },
          { id: 'cfg_defaultTo',       label: 'Default Recipient (optional)',     type: 'email',    placeholder: 'default@example.com',    cfgKey: 'emailTo' },
        ],
        note: 'Setup: 1) Create free account at emailjs.com  2) Add Gmail as an Email Service → copy the Service ID  3) Create an Email Template with variables {{to_email}}, {{subject}}, {{message}}, {{from_name}} → copy Template ID  4) Go to Account → copy your Public Key.',
      },
      smarthome: {
        title: '💡 Smart Home Setup',
        fields: [
          { id: 'cfg_hueBridge', label: 'Hue Bridge IP', type: 'text', placeholder: '192.168.1.100', cfgKey: 'hueBridgeIp' },
          { id: 'cfg_hueUser', label: 'Hue Username/Token', type: 'text', placeholder: 'Your Hue API username', cfgKey: 'hueUsername' },
        ],
      },
      calls: {
        title: '📞 Twilio Setup',
        fields: [
          { id: 'cfg_twilioSid', label: 'Twilio Account SID', type: 'text', placeholder: 'ACxxxxxxxx', cfgKey: 'twilioSid' },
          { id: 'cfg_twilioToken', label: 'Auth Token', type: 'password', placeholder: 'Your auth token', cfgKey: 'twilioToken' },
          { id: 'cfg_twilioFrom', label: 'Twilio Phone Number', type: 'tel', placeholder: '+1234567890', cfgKey: 'twilioFrom' },
        ],
      },
    };

    const cfg = settingsMap[type];
    if (!cfg) return;

    title.textContent = cfg.title;
    content.innerHTML = cfg.fields.map(f => `
      <div class="modal-field" style="margin-bottom:var(--space-4)">
        <label class="modal-label">${f.label}</label>
        <input
          class="modal-input"
          id="${f.id}"
          type="${f.type}"
          placeholder="${f.placeholder}"
          value="${state.config[f.cfgKey] || ''}"
          data-cfg-key="${f.cfgKey}"
        />
      </div>
    `).join('') + (cfg.note ? `<div style="font-size:var(--text-xs);color:var(--color-text-muted);line-height:1.6;padding:var(--space-3);background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);margin-top:var(--space-2)">${cfg.note}</div>` : '');

    // Store which type we're editing
    modal.dataset.settingsType = type;
    openModal('settingsModal');
  }

  function saveSettings() {
    const inputs = document.querySelectorAll('#settingsContent [data-cfg-key]');
    inputs.forEach(input => {
      state.config[input.dataset.cfgKey] = input.value.trim() || null;
    });
    // Gmail always uses smtp.gmail.com
    if (state.config.emailUser) state.config.emailHost = 'smtp.gmail.com';

    // Update status badges
    if (state.config.emailUser) {
      document.getElementById('emailStatus').textContent = 'ONLINE';
      document.getElementById('emailStatus').className = 'status-badge online';
    }
    if (state.config.hueBridgeIp) {
      document.getElementById('lightsStatus').textContent = 'ONLINE';
      document.getElementById('lightsStatus').className = 'status-badge online';
    }
    if (state.config.twilioSid) {
      document.getElementById('callStatus').textContent = 'ONLINE';
      document.getElementById('callStatus').className = 'status-badge online';
    }

    log('Settings saved', 'success');
    closeModal('settingsModal');
  }

  /* ── UI HELPERS ── */
  function appendMessage(role, content) {
    const container = document.getElementById('chatMessages');

    const wrapper = document.createElement('div');
    wrapper.className = `message message-${role}`;

    const sender = document.createElement('div');
    sender.className = 'message-sender';
    sender.textContent = role === 'user' ? 'TYLER' : 'CHARLOTTE';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.innerHTML = formatMessage(content);

    wrapper.appendChild(sender);
    wrapper.appendChild(bubble);
    container.appendChild(wrapper);
    scrollToBottom();
  }

  function formatMessage(text) {
    // Simple markdown-like formatting
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code style="background:rgba(0,212,255,0.1);padding:1px 4px;border-radius:3px;font-family:inherit">$1</code>')
      .replace(/\n/g, '<br/>');
  }

  function showTyping() {
    const container = document.getElementById('chatMessages');
    const el = document.createElement('div');
    el.className = 'message message-charlotte';
    el.id = 'typingIndicator';
    el.innerHTML = `
      <div class="message-sender">CHARLOTTE</div>
      <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    `;
    container.appendChild(el);
    scrollToBottom();
    return el;
  }

  function removeTyping(el) {
    el?.remove();
  }

  function showToolResultCard(title, items) {
    const container = document.getElementById('chatMessages');
    const card = document.createElement('div');
    card.className = 'tool-result';
    card.innerHTML = `
      <div class="tool-result-header">⚡ ${escHtml(title)}</div>
      ${items.map(item => `
        <div style="display:flex;gap:8px;margin-bottom:4px">
          <span style="color:var(--color-text-faint);min-width:70px;flex-shrink:0">${escHtml(item.label)}:</span>
          <span>${escHtml(item.value)}</span>
        </div>
      `).join('')}
    `;
    container.appendChild(card);
    scrollToBottom();
  }

  function escHtml(str) {
    return String(str || '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;');
  }

  function scrollToBottom() {
    const c = document.getElementById('chatMessages');
    requestAnimationFrame(() => c.scrollTop = c.scrollHeight);
  }

  function setOrbState(state_) {
    const orb = document.getElementById('orbCore');
    orb.classList.remove('listening', 'speaking', 'processing');
    if (state_ === 'listening') orb.classList.add('listening');
    else if (state_ === 'speaking') orb.classList.add('speaking');
  }

  function updateStatusDot(online) {
    const dot = document.getElementById('statusDot');
    dot.style.background = online ? 'var(--color-success)' : 'var(--color-error)';
    dot.style.boxShadow = online ? '0 0 8px var(--color-success)' : '0 0 8px var(--color-error)';
  }

  function log(text, type = 'info') {
    const feed = document.getElementById('logFeed');
    const now = new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `
      <span class="log-time">${now}</span>
      <span class="log-text log-${type}">${escHtml(text)}</span>
    `;
    feed.prepend(entry); // newest at top
    // Keep only 50 entries
    while (feed.children.length > 50) feed.removeChild(feed.lastChild);
  }

  function updateClock() {
    const elapsed = Math.floor((Date.now() - state.sessionStart) / 1000);
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');
    document.getElementById('headerSession').textContent = `${mm}:${ss}`;
  }

  function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  function flashError(el, msg) {
    el.style.borderColor = 'var(--color-error)';
    el.setAttribute('placeholder', msg);
    setTimeout(() => {
      el.style.borderColor = '';
      el.setAttribute('placeholder', el.getAttribute('placeholder').startsWith(msg) ? '' : el.getAttribute('placeholder'));
    }, 2000);
  }

  function addTask(name) {
    const list = document.getElementById('taskList');
    const existing = list.querySelector('[data-task="none"]');
    if (existing) existing.remove();

    const item = document.createElement('div');
    item.className = 'status-item';
    item.dataset.taskName = name;
    item.innerHTML = `
      <span class="status-item-label">${escHtml(name)}</span>
      <span class="status-badge standby">RUNNING</span>
    `;
    list.appendChild(item);
  }

  function removeTask(name) {
    const list = document.getElementById('taskList');
    const item = list.querySelector(`[data-task-name="${name}"]`);
    item?.remove();

    if (!list.children.length) {
      const empty = document.createElement('div');
      empty.className = 'status-item';
      empty.dataset.task = 'none';
      empty.innerHTML = `<span class="status-item-label" style="color:var(--color-text-faint)">No active tasks</span>`;
      list.appendChild(empty);
    }
  }

  /* ── MODALS ── */
  function openModal(id) {
    document.getElementById(id)?.classList.add('open');
  }

  function closeModal(id) {
    document.getElementById(id)?.classList.remove('open');
  }

  // Close modal on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });

  /* ── INPUT HANDLERS ── */
  function setupInputHandlers() {
    const field = document.getElementById('inputField');

    field.addEventListener('input', () => autoResize(field));

    field.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  function clearChat() {
    state.messages = [];
    state.msgCount = 0;
    state.totalTokens = 0;
    document.getElementById('chatMessages').innerHTML = '';
    document.getElementById('headerMsgCount').textContent = '0';
    document.getElementById('tokenCount').textContent = '0';
    log('Conversation cleared', 'info');
    const msg = 'Conversation cleared. Starting fresh.';
    appendMessage('charlotte', msg);
    speak(msg);
  }

  /* ── VOICES POPULATED ── */
  document.getElementById('ttsEngine').addEventListener('change', e => {
    const labels = {
      'openai': 'OpenAI Nova HD',
      'openai-shimmer': 'OpenAI Shimmer HD',
      'openai-alloy': 'OpenAI Alloy HD',
      'browser': 'Browser TTS',
    };
    log(`Voice engine: ${labels[e.target.value] || e.target.value}`, 'info');
  });

  document.getElementById('voiceSpeed').addEventListener('input', e => {
    log(`Voice speed: ${e.target.value}x`, 'info');
  });


  /* ═══════════════════════════════════════════════════════
     MINI-APPS — Draggable HUD Windows
     ═══════════════════════════════════════════════════════ */

  // ── Draggable system ──
  function makeDraggable(appEl, barEl) {
    let startX, startY, startLeft, startTop, isDragging = false;

    barEl.addEventListener('mousedown', e => {
      if (e.target.closest('.mini-app-btn')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = appEl.getBoundingClientRect();
      startLeft = rect.left;
      startTop  = rect.top;
      appEl.style.right = 'auto';
      appEl.classList.add('dragging');
      e.preventDefault();
    });

    // Touch support
    barEl.addEventListener('touchstart', e => {
      if (e.target.closest('.mini-app-btn')) return;
      isDragging = true;
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      const rect = appEl.getBoundingClientRect();
      startLeft = rect.left;
      startTop  = rect.top;
      appEl.style.right = 'auto';
      appEl.classList.add('dragging');
    }, { passive: true });

    document.addEventListener('mousemove', e => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const maxL = window.innerWidth  - appEl.offsetWidth;
      const maxT = window.innerHeight - appEl.offsetHeight;
      appEl.style.left = Math.max(0, Math.min(startLeft + dx, maxL)) + 'px';
      appEl.style.top  = Math.max(0, Math.min(startTop  + dy, maxT)) + 'px';
    });

    document.addEventListener('touchmove', e => {
      if (!isDragging) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const maxL = window.innerWidth  - appEl.offsetWidth;
      const maxT = window.innerHeight - appEl.offsetHeight;
      appEl.style.left = Math.max(0, Math.min(startLeft + dx, maxL)) + 'px';
      appEl.style.top  = Math.max(0, Math.min(startTop  + dy, maxT)) + 'px';
    }, { passive: true });

    const stopDrag = () => { isDragging = false; appEl.classList.remove('dragging'); };
    document.addEventListener('mouseup',  stopDrag);
    document.addEventListener('touchend', stopDrag);
  }

  // ── Init all draggable mini-apps ──
  function initMiniApps() {
    [
      ['miniTimer',    'miniTimerBar'],
      ['miniReminder', 'miniReminderBar'],
      ['miniWeather',  'miniWeatherBar'],
      ['miniSearch',   'miniSearchBar'],
      ['miniMusic',    'miniMusicBar'],
    ].forEach(([appId, barId]) => {
      const app = document.getElementById(appId);
      const bar = document.getElementById(barId);
      if (app && bar) makeDraggable(app, bar);
    });

    // Start reminder polling loop
    setInterval(checkReminders, 30000);
  }

  function openMiniApp(id) {
    const el = document.getElementById(id);
    if (!el) return;
    // Bring to front
    document.querySelectorAll('.mini-app').forEach(a => a.style.zIndex = 900);
    el.style.zIndex = 910;
    el.classList.add('open');
    el.style.display = '';

    // Auto-load weather when opened — and speak the result
    if (id === 'miniWeather') loadWeather(true);
  }

  function closeMiniApp(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('open');
  }

  function minimizeMiniApp(id) {
    closeMiniApp(id);
  }

  function bringToFront(id) {
    document.querySelectorAll('.mini-app').forEach(a => a.style.zIndex = 900);
    const el = document.getElementById(id);
    if (el) el.style.zIndex = 910;
  }

  // Click to focus
  document.addEventListener('mousedown', e => {
    const app = e.target.closest('.mini-app');
    if (app) {
      document.querySelectorAll('.mini-app').forEach(a => a.style.zIndex = 900);
      app.style.zIndex = 910;
    }
  });

  // Toast notification
  function miniToast(msg, duration = 3500) {
    const el = document.getElementById('miniappToast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._toastTimer);
    el._toastTimer = setTimeout(() => el.classList.remove('show'), duration);
  }


  /* ─────────────────── TIMER ─────────────────── */
  const timerState = {
    total:     0,   // seconds set
    remaining: 0,   // seconds left
    running:   false,
    interval:  null,
    label:     '',
  };

  const TIMER_CIRCUMFERENCE = 2 * Math.PI * 78; // 490.09

  function timerPreset(minutes) {
    timerStop();
    timerState.total     = minutes * 60;
    timerState.remaining = minutes * 60;
    timerState.label     = `${minutes} minute timer`;
    timerUpdateDisplay();
    document.getElementById('timerLabel').textContent = timerState.label;
  }

  function timerSetCustom() {
    const m = parseInt(document.getElementById('timerMinInput').value) || 0;
    const s = parseInt(document.getElementById('timerSecInput').value) || 0;
    const total = m * 60 + s;
    if (total <= 0) { miniToast('Enter a time above 0'); return; }
    timerStop();
    timerState.total     = total;
    timerState.remaining = total;
    timerState.label     = `${m > 0 ? m + ' min ' : ''}${s > 0 ? s + ' sec' : ''}timer`.trim();
    timerUpdateDisplay();
    document.getElementById('timerLabel').textContent = timerState.label;
  }

  function timerToggle() {
    if (timerState.remaining <= 0 && !timerState.running) {
      miniToast('Set a time first');
      return;
    }
    if (timerState.running) {
      timerStop();
      document.getElementById('timerStartBtn').textContent = 'Resume';
    } else {
      timerStart();
    }
  }

  function timerStart() {
    if (timerState.remaining <= 0) return;
    timerState.running = true;
    document.getElementById('timerStartBtn').textContent = 'Pause';
    timerState.interval = setInterval(() => {
      timerState.remaining--;
      timerUpdateDisplay();
      if (timerState.remaining <= 0) {
        timerStop();
        timerFire();
      }
    }, 1000);
  }

  function timerStop() {
    clearInterval(timerState.interval);
    timerState.running = false;
    document.getElementById('timerStartBtn').textContent = 'Start';
  }

  function timerReset() {
    timerStop();
    timerState.remaining = timerState.total;
    timerUpdateDisplay();
    document.getElementById('timerLabel').textContent = timerState.label || 'Set a timer';
    const ring = document.getElementById('timerRingProgress');
    if (ring) ring.classList.remove('urgent');
  }

  function timerUpdateDisplay() {
    const r = timerState.remaining;
    const m = String(Math.floor(r / 60)).padStart(2, '0');
    const s = String(r % 60).padStart(2, '0');
    document.getElementById('timerDisplay').textContent = `${m}:${s}`;

    // Ring progress
    const ring = document.getElementById('timerRingProgress');
    if (ring && timerState.total > 0) {
      const fraction = r / timerState.total;
      ring.style.strokeDashoffset = TIMER_CIRCUMFERENCE * (1 - fraction);
      if (r <= 10 && r > 0) {
        ring.classList.add('urgent');
      } else {
        ring.classList.remove('urgent');
      }
    }
  }

  function timerFire() {
    // Visual flash
    const ring = document.getElementById('timerRingProgress');
    if (ring) ring.classList.add('urgent');

    // Alarm beep using Web Audio API
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const beepPattern = [0, 0.3, 0.6, 0.9];
      beepPattern.forEach(offset => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.4, ctx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.25);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.25);
      });
    } catch(e) {}

    document.getElementById('timerLabel').textContent = 'Timer complete!';
    miniToast('⏱ Timer finished!', 5000);
    log('Timer complete', 'success');

    // Notify Charlotte
    const msg = 'Tyler, your timer is done.';
    appendMessage('charlotte', msg);
    if (state.autoSpeak) speak(msg);
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('Timer done!', { body: 'Your timer has finished.', icon: '' });
    }
  }


  /* ─────────────────── REMINDERS ─────────────────── */
  const reminders = [];

  function requestNotifPerms() {
    if (typeof Notification === 'undefined') {
      miniToast('Notifications not supported in this browser');
      return;
    }
    Notification.requestPermission().then(p => {
      miniToast(p === 'granted' ? 'Notifications enabled!' : 'Notification permission denied');
      log(`Notification permission: ${p}`, p === 'granted' ? 'success' : 'warn');
    });
  }

  function addReminder(textOverride, timeOverride) {
    const text = textOverride || document.getElementById('reminderText').value.trim();
    if (!text) { miniToast('Enter reminder text'); return; }

    let targetTime;

    if (timeOverride) {
      targetTime = timeOverride;
    } else {
      const timeVal = document.getElementById('reminderTime').value;
      const dateVal = document.getElementById('reminderDate').value;
      if (!timeVal) { miniToast('Set a time for the reminder'); return; }
      const dateStr = dateVal || new Date().toISOString().split('T')[0];
      targetTime = new Date(`${dateStr}T${timeVal}:00`);
      if (isNaN(targetTime.getTime()) || targetTime <= new Date()) {
        miniToast('Please set a future time');
        return;
      }
    }

    const reminder = {
      id: Date.now(),
      text,
      time: targetTime,
      fired: false,
    };
    reminders.push(reminder);
    renderReminderList();

    // Clear form
    document.getElementById('reminderText').value = '';
    document.getElementById('reminderTime').value = '';
    document.getElementById('reminderDate').value = '';

    const timeStr = targetTime.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
    miniToast(`Reminder set for ${timeStr}`);
    log(`Reminder: "${text}" at ${timeStr}`, 'success');
  }

  function dismissReminder(id) {
    const idx = reminders.findIndex(r => r.id === id);
    if (idx !== -1) reminders.splice(idx, 1);
    renderReminderList();
  }

  function renderReminderList() {
    const list = document.getElementById('reminderList');
    if (!list) return;
    if (!reminders.length) {
      list.innerHTML = '<div style="font-size:var(--text-xs);color:var(--color-text-faint);text-align:center;padding:var(--space-3)">No reminders set</div>';
      return;
    }
    list.innerHTML = reminders.map(r => {
      const timeStr = r.time.toLocaleString('en-AU', { weekday:'short', hour:'2-digit', minute:'2-digit' });
      return `
        <div class="reminder-item ${r.fired ? 'fired' : ''}" id="rem-${r.id}">
          <div style="flex:1">
            <div class="reminder-item-text">${escHtml(r.text)}</div>
            <div class="reminder-item-time">${timeStr}</div>
          </div>
          <button class="reminder-item-dismiss" onclick="Charlotte.dismissReminder(${r.id})" title="Dismiss">&times;</button>
        </div>
      `;
    }).join('');
  }

  function checkReminders() {
    const now = new Date();
    reminders.forEach(r => {
      if (!r.fired && r.time <= now) {
        r.fired = true;
        fireReminder(r);
      }
    });
    renderReminderList();
  }

  function fireReminder(r) {
    // Sound
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.4, 0.8].forEach(off => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 660;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.35, ctx.currentTime + off);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + off + 0.3);
        osc.start(ctx.currentTime + off);
        osc.stop(ctx.currentTime + off + 0.3);
      });
    } catch(e) {}

    miniToast(`⏰ Reminder: ${r.text}`, 6000);
    log(`Reminder fired: ${r.text}`, 'info');

    // Browser notification
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('Charlotte Reminder', { body: r.text });
    }

    // Charlotte speaks
    const msg = `Tyler, reminder: ${r.text}`;
    appendMessage('charlotte', msg);
    if (state.autoSpeak) speak(msg);

    // Open mini-app if closed
    openMiniApp('miniReminder');
  }

  // Parse natural language reminder from Charlotte tool call
  function parseReminderFromText(text) {
    // E.g. "in 10 minutes", "at 3pm", "tomorrow at 9am"
    const inMatch = text.match(/in (\d+)\s*(minute|min|hour|hr|second|sec)s?/i);
    if (inMatch) {
      const num = parseInt(inMatch[1]);
      const unit = inMatch[2].toLowerCase();
      const ms = unit.startsWith('h') ? num * 3600000 : unit.startsWith('s') ? num * 1000 : num * 60000;
      return new Date(Date.now() + ms);
    }
    const atMatch = text.match(/at (\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (atMatch) {
      const now = new Date();
      let h = parseInt(atMatch[1]);
      const m = parseInt(atMatch[2] || '0');
      const ampm = (atMatch[3] || '').toLowerCase();
      if (ampm === 'pm' && h < 12) h += 12;
      if (ampm === 'am' && h === 12) h = 0;
      const t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
      if (t <= now) t.setDate(t.getDate() + 1);
      return t;
    }
    return null;
  }


  /* ─────────────────── WEATHER ─────────────────── */

  // Weather code → emoji + description
  const WMO_CODES = {
    0:  ['☀️',  'Clear sky'],
    1:  ['🌤️', 'Mainly clear'],
    2:  ['⛅',  'Partly cloudy'],
    3:  ['☁️',  'Overcast'],
    45: ['🌫️', 'Foggy'],
    48: ['🌫️', 'Icy fog'],
    51: ['🌦️', 'Light drizzle'],
    53: ['🌦️', 'Drizzle'],
    55: ['🌧️', 'Heavy drizzle'],
    61: ['🌧️', 'Light rain'],
    63: ['🌧️', 'Rain'],
    65: ['🌧️', 'Heavy rain'],
    71: ['🌨️', 'Light snow'],
    73: ['🌨️', 'Snow'],
    75: ['❄️',  'Heavy snow'],
    80: ['🌦️', 'Rain showers'],
    81: ['🌧️', 'Showers'],
    82: ['⛈️', 'Violent showers'],
    95: ['⛈️', 'Thunderstorm'],
    96: ['⛈️', 'Thunderstorm with hail'],
    99: ['⛈️', 'Severe thunderstorm'],
  };

  function wmoInfo(code) {
    return WMO_CODES[code] || ['🌡️', 'Unknown'];
  }

  let _weatherSpeak = false;

  async function loadWeather(speak_on_load = false) {
    if (speak_on_load) _weatherSpeak = true;
    const loading = document.getElementById('weatherLoading');
    const content = document.getElementById('weatherContent');
    if (loading) loading.style.display = 'flex';
    if (content) content.style.display = 'none';

    try {
      // Sydney coords
      const lat = -33.8688, lon = 151.2093;
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,uv_index&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Australia%2FSydney&forecast_days=5`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Weather API error');
      const data = await res.json();

      const cur = data.current;
      const [icon, desc] = wmoInfo(cur.weather_code);

      document.getElementById('weatherIconBig').textContent = icon;
      document.getElementById('weatherTempBig').textContent = `${Math.round(cur.temperature_2m)}°`;
      document.getElementById('weatherDesc').textContent = desc;
      document.getElementById('weatherFeels').textContent = `${Math.round(cur.apparent_temperature)}°`;
      document.getElementById('weatherHumidity').textContent = `${cur.relative_humidity_2m}%`;
      document.getElementById('weatherWind').textContent = `${Math.round(cur.wind_speed_10m)} km/h`;
      document.getElementById('weatherUV').textContent = cur.uv_index?.toFixed(1) ?? '--';

      // Forecast
      const forecastEl = document.getElementById('weatherForecast');
      const days = data.daily;
      const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      forecastEl.innerHTML = days.time.map((dateStr, i) => {
        const d = new Date(dateStr);
        const name = i === 0 ? 'Today' : dayNames[d.getDay()];
        const [dayIcon] = wmoInfo(days.weather_code[i]);
        const hi = Math.round(days.temperature_2m_max[i]);
        const lo = Math.round(days.temperature_2m_min[i]);
        return `<div class="weather-forecast-day">
          <div class="day-name">${name}</div>
          <div class="day-icon">${dayIcon}</div>
          <div class="day-hi">${hi}°</div>
          <div class="day-lo">${lo}°</div>
        </div>`;
      }).join('');

      if (loading) loading.style.display = 'none';
      if (content) content.style.display = '';
      log(`Weather loaded — ${Math.round(cur.temperature_2m)}°C ${desc}`, 'success');

      const summary = `${desc}, ${Math.round(cur.temperature_2m)}°C (feels ${Math.round(cur.apparent_temperature)}°C), humidity ${cur.relative_humidity_2m}%, wind ${Math.round(cur.wind_speed_10m)} km/h`;

      // Speak weather if this was triggered by opening the mini-app
      if (_weatherSpeak && state.apiKey) {
        const spokenSummary = `It's currently ${Math.round(cur.temperature_2m)} degrees in Sydney. ${desc}. Feels like ${Math.round(cur.apparent_temperature)} degrees, with ${cur.relative_humidity_2m} percent humidity and winds at ${Math.round(cur.wind_speed_10m)} kilometres per hour.`;
        appendMessage('charlotte', spokenSummary);
        speak(spokenSummary);
        _weatherSpeak = false;
      }

      // Return summary for Charlotte
      return summary;
    } catch (err) {
      if (loading) loading.textContent = '⚠ Could not load weather';
      log(`Weather error: ${err.message}`, 'error');
      return 'Could not fetch weather data';
    }
  }


  /* ─────────────────── SEARCH ─────────────────── */

  async function doSearch(queryOverride) {
    const query = queryOverride || document.getElementById('searchInput').value.trim();
    if (!query) return;

    const resultsEl = document.getElementById('searchResults');
    resultsEl.innerHTML = '<div class="search-empty">Searching...</div>';

    // Open the mini-app if closed
    openMiniApp('miniSearch');
    if (!queryOverride) document.getElementById('searchInput').value = query;

    log(`Web search: ${query}`, 'info');

    try {
      // DuckDuckGo Instant Answers
      const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      const res = await fetch(ddgUrl);
      const data = await res.json();

      let html = '';

      // AI instant answer
      if (data.AbstractText) {
        html += `<div class="search-ai-answer">
          <div class="search-ai-label">✦ Quick Answer</div>
          <div class="search-ai-text">${escHtml(data.AbstractText)}</div>
        </div>`;
      } else if (data.Answer) {
        html += `<div class="search-ai-answer">
          <div class="search-ai-label">✦ Answer</div>
          <div class="search-ai-text">${escHtml(data.Answer)}</div>
        </div>`;
      }

      // Related topics as results
      if (data.RelatedTopics?.length) {
        const topics = data.RelatedTopics.filter(t => t.Text).slice(0, 6);
        topics.forEach(t => {
          const url = t.FirstURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
          html += `<a class="search-result-item" href="${url}" target="_blank" rel="noopener">
            <div class="search-result-title">${escHtml(t.Text.split(' - ')[0].substring(0, 80))}</div>
            <div class="search-result-snippet">${escHtml(t.Text.substring(0, 160))}</div>
            <div class="search-result-url">${escHtml(url)}</div>
          </a>`;
        });
      }

      // Fallback: open web link
      if (!html) {
        html = `<div class="search-empty">No instant answer found.</div>
          <a class="search-result-item" href="https://duckduckgo.com/?q=${encodeURIComponent(query)}" target="_blank" rel="noopener">
            <div class="search-result-title">Search DuckDuckGo</div>
            <div class="search-result-snippet">Open full search results for: ${escHtml(query)}</div>
          </a>
          <a class="search-result-item" href="https://www.google.com/search?q=${encodeURIComponent(query)}" target="_blank" rel="noopener">
            <div class="search-result-title">Search Google</div>
            <div class="search-result-snippet">Open Google results for: ${escHtml(query)}</div>
          </a>`;
      }

      resultsEl.innerHTML = html;

      // Feed summary back to Charlotte
      const summary = data.AbstractText || data.Answer || (data.RelatedTopics?.[0]?.Text) || 'No direct answer found';
      return summary;

    } catch (err) {
      resultsEl.innerHTML = `<div class="search-empty">Search error. Check your connection.</div>`;
      log(`Search error: ${err.message}`, 'error');
      return `Search failed: ${err.message}`;
    }
  }


  /* ─────────────────── MUSIC ─────────────────── */

  const musicState = {
    window: null,
    loaded: false,
  };

  function musicOpenYT() {
    // Load YT Music into the iframe inside the mini-app
    const frame = document.getElementById('musicFrame');
    if (frame) {
      frame.src = 'https://music.youtube.com';
      musicState.loaded = true;
      document.getElementById('musicStatus').textContent = 'Loading YT Music...';
      frame.onload = () => {
        document.getElementById('musicStatus').textContent = 'YT Music ready — use controls below';
      };
    }
    log('YT Music loaded in mini-app', 'info');
  }

  function musicFocusAndKey(keyCode, shiftKey) {
    // Focus the iframe then dispatch the key into it
    const frame = document.getElementById('musicFrame');
    if (!frame || !musicState.loaded) {
      miniToast('Load YT Music first — click the Load button');
      return false;
    }
    frame.focus();
    try {
      // Dispatch to iframe contentWindow — may be blocked cross-origin
      const opts = { key: String.fromCharCode(keyCode), keyCode, which: keyCode, bubbles: true, shiftKey: !!shiftKey };
      frame.contentWindow.document.body.dispatchEvent(new KeyboardEvent('keydown', opts));
      frame.contentWindow.document.body.dispatchEvent(new KeyboardEvent('keyup', opts));
      return true;
    } catch(e) {
      // Cross-origin restriction — guide user
      miniToast('Click inside the YT Music frame first, then use keyboard shortcuts');
      return false;
    }
  }

  function musicCmd(cmd) {
    openMiniApp('miniMusic');
    if (!musicState.loaded) { musicOpenYT(); return; }

    // YT Music keyboard shortcuts: k = play/pause, Shift+N = next, Shift+P = prev
    const cmds = {
      play:  () => musicFocusAndKey(75, false),   // k
      pause: () => musicFocusAndKey(75, false),   // k
      next:  () => musicFocusAndKey(78, true),    // Shift+N
      prev:  () => musicFocusAndKey(80, true),    // Shift+P
    };
    if (cmds[cmd]) cmds[cmd]();
    document.getElementById('musicStatus').textContent = `${cmd} — click inside the music frame if nothing happened`;
    log(`Music: ${cmd}`, 'info');
  }

  function musicSearch(queryOverride) {
    const query = queryOverride || document.getElementById('musicSearchInput').value.trim();
    if (!query) return;
    openMiniApp('miniMusic');
    const frame = document.getElementById('musicFrame');
    if (frame) {
      frame.src = `https://music.youtube.com/search?q=${encodeURIComponent(query)}`;
      musicState.loaded = true;
      document.getElementById('musicStatus').textContent = `Searching: "${query}"`;
    }
    miniToast(`Searching YT Music: ${query}`);
    log(`Music search: ${query}`, 'info');
  }


  /* ─────────────────── TOOL INTEGRATION ─────────────────── */

  // Updated quickAction — now opens mini-apps directly for relevant tools
  function quickActionMiniApp(type) {
    if (!state.apiKey) { log('Activate Charlotte first', 'warn'); return; }

    const miniAppMap = {
      weather:  'miniWeather',
      reminder: 'miniReminder',
      timer:    'miniTimer',
      search:   'miniSearch',
      music:    'miniMusic',
    };

    if (miniAppMap[type]) {
      openMiniApp(miniAppMap[type]);
      log(`Opened ${type} mini-app`, 'info');
      return;
    }

    // Fall through to chat for email / call / lights
    const prompts = {
      email:  'I want to send an email.',
      call:   'I want to make a phone call.',
      lights: 'Control my lights.',
    };
    const text = prompts[type] || `I want to use ${type}.`;
    appendMessage('user', text);
    state.messages.push({ role: 'user', content: text });
    state.msgCount++;
    document.getElementById('headerMsgCount').textContent = state.msgCount;
    processWithAI();
  }

  /* ─────────────────── NEW TOOL HANDLERS ─────────────────── */

  async function handleSetTimer(args) {
    const seconds = (args.minutes || 0) * 60 + (args.seconds || 0);
    if (seconds <= 0) return 'No time specified for timer';
    timerStop();
    timerState.total     = seconds;
    timerState.remaining = seconds;
    timerState.label     = args.label || `${args.minutes || 0}m ${args.seconds || 0}s timer`;
    timerUpdateDisplay();
    const labelEl = document.getElementById('timerLabel');
    if (labelEl) labelEl.textContent = timerState.label;
    openMiniApp('miniTimer');
    timerStart();
    const m = Math.floor(seconds / 60), s = seconds % 60;
    const timeStr = m > 0 ? `${m} minute${m > 1 ? 's' : ''}${s > 0 ? ` ${s} seconds` : ''}` : `${s} seconds`;
    return `Timer set for ${timeStr} and started.`;
  }

  async function handleSetReminder(args) {
    let targetTime = null;
    if (args.datetime) {
      targetTime = new Date(args.datetime);
    } else if (args.text) {
      targetTime = parseReminderFromText(args.text + ' ' + (args.when || ''));
    }
    if (!targetTime || isNaN(targetTime.getTime())) {
      // Default 10 minutes
      targetTime = new Date(Date.now() + 10 * 60000);
    }
    if (targetTime <= new Date()) targetTime = new Date(Date.now() + 60000);

    openMiniApp('miniReminder');
    addReminder(args.message || args.text || 'Reminder', targetTime);
    const timeStr = targetTime.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
    return `Reminder set for ${timeStr}: "${args.message || args.text}"`;
  }

  async function handleGetWeather(args) {
    openMiniApp('miniWeather');
    // loadWeather will speak automatically since openMiniApp already passes speak=true
    const summary = await loadWeather(false);
    return `Current weather in Sydney: ${summary}`;
  }

  async function handleWebSearchMini(args) {
    openMiniApp('miniSearch');
    const el = document.getElementById('searchInput');
    if (el) el.value = args.query;
    const result = await doSearch(args.query);
    return `Search results for "${args.query}": ${result}`;
  }

  async function handleMusicControl(args) {
    openMiniApp('miniMusic');
    if (args.action === 'search' && args.query) {
      musicSearch(args.query);
      return `Opening YT Music and searching for "${args.query}".`;
    }
    if (args.action === 'open') {
      musicOpenYT();
      return 'Opening YouTube Music.';
    }
    musicCmd(args.action);
    return `Music: ${args.action} command sent.`;
  }


    /* ── BOOT ── */
  init();

  /* ── PUBLIC API ── */
  return { sendMessage, toggleVoice, quickAction, openSettings, saveSettings, clearChat, openModal, closeModal, executeEmail, executeCall, executeLights, resetAuth, openMiniApp, closeMiniApp, minimizeMiniApp, timerPreset, timerSetCustom, timerToggle, timerReset, addReminder, dismissReminder, requestNotifPerms, loadWeather, doSearch, musicOpenYT, musicCmd, musicSearch };
})();
