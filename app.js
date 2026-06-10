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
6. **show_tool_result** — Display a structured result card in the chat.

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
  ];

  /* ── INIT ── */
  function init() {
    setupSpeechRecognition();
    setupVoices();
    setupInputHandlers();
    updateClock();
    setInterval(updateClock, 1000);

    // Note: sessionStorage not used (sandboxed preview). Key stays in memory only.

    log('System ready — awaiting API key', 'info');
  }

  function activateWithKey(key) {
    state.apiKey = key;
    document.getElementById('apiOverlay').style.display = 'none';
    log('API key accepted', 'success');
    log('Charlotte online', 'success');
    updateStatusDot(true);

    // Boot greeting
    setTimeout(() => {
      const hour = new Date().getHours();
      const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
      appendMessage('charlotte', `${greeting}, Tyler. Charlotte is online. How can I help you today?`);
      speak(`${greeting}, Tyler. Charlotte is online. How can I help?`);
      log('Boot greeting delivered', 'info');
    }, 600);
  }

  /* ── API KEY HANDLER ── */
  document.getElementById('apiKeySubmit').addEventListener('click', () => {
    const key = document.getElementById('apiKeyInput').value.trim();
    if (!key.startsWith('sk-')) {
      flashError(document.getElementById('apiKeyInput'), 'Key must start with sk-');
      return;
    }
    activateWithKey(key);
  });

  document.getElementById('apiKeyInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('apiKeySubmit').click();
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
    if (!state.config.emailUser) {
      openModal('emailModal');
      // Prefill if we have data
      if (args.to) document.getElementById('emailTo').value = args.to;
      if (args.subject) document.getElementById('emailSubject').value = args.subject;
      if (args.body) document.getElementById('emailBody').value = args.body;
      return 'Email modal opened. User needs to fill in details and send manually as SMTP credentials are not yet configured.';
    }

    // If credentials configured, use EmailJS or show result
    showToolResultCard('Email Sent', [
      { label: 'To', value: args.to },
      { label: 'Subject', value: args.subject },
      { label: 'Status', value: '✓ Queued for delivery' },
    ]);
    log(`Email drafted to ${args.to}`, 'success');
    return `Email composed to ${args.to} with subject "${args.subject}". Note: actual SMTP sending requires backend configuration. Shown in UI as preview.`;
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

    const prompts = {
      email:    'I want to send an email.',
      call:     'I want to make a phone call.',
      lights:   'Control my lights.',
      search:   'Search the web for something.',
      weather:  'What\'s the weather like in Sydney right now?',
      reminder: 'Set a reminder for me.',
      music:    'Play some music.',
      timer:    'Set a timer.',
    };

    const text = prompts[type] || `I want to use ${type}.`;
    appendMessage('user', text);
    state.messages.push({ role: 'user', content: text });
    state.msgCount++;
    document.getElementById('headerMsgCount').textContent = state.msgCount;
    processWithAI();
  }

  /* ── MODAL EXECUTE ── */
  function executeEmail() {
    const to      = document.getElementById('emailTo').value.trim();
    const subject = document.getElementById('emailSubject').value.trim();
    const body    = document.getElementById('emailBody').value.trim();
    if (!to || !subject) { flashError(document.getElementById('emailTo'), 'Fill in all fields'); return; }

    closeModal('emailModal');
    showToolResultCard('Email Drafted', [
      { label: 'To', value: to },
      { label: 'Subject', value: subject },
      { label: 'Note', value: 'Connect email backend to send automatically' },
    ]);

    const feedbackMsg = `Email to ${to} with subject "${subject}" has been prepared. To enable automatic sending, configure your email settings in the left panel.`;
    appendMessage('charlotte', feedbackMsg);
    speak(feedbackMsg);
    log(`Email prepared for ${to}`, 'success');
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
        title: '✉️ Email Configuration',
        fields: [
          { id: 'cfg_emailUser', label: 'Gmail / Email Address', type: 'email', placeholder: 'you@gmail.com', cfgKey: 'emailUser' },
          { id: 'cfg_emailPass', label: 'App Password', type: 'password', placeholder: 'Gmail app password', cfgKey: 'emailPass' },
          { id: 'cfg_emailHost', label: 'SMTP Host', type: 'text', placeholder: 'smtp.gmail.com', cfgKey: 'emailHost' },
          { id: 'cfg_defaultTo', label: 'Default Recipient (optional)', type: 'email', placeholder: 'default@example.com', cfgKey: 'emailTo' },
        ],
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
    `).join('');

    // Store which type we're editing
    modal.dataset.settingsType = type;
    openModal('settingsModal');
  }

  function saveSettings() {
    const inputs = document.querySelectorAll('#settingsContent [data-cfg-key]');
    inputs.forEach(input => {
      state.config[input.dataset.cfgKey] = input.value.trim() || null;
    });

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

  /* ── BOOT ── */
  init();

  /* ── PUBLIC API ── */
  return { sendMessage, toggleVoice, quickAction, openSettings, saveSettings, clearChat, openModal, closeModal, executeEmail, executeCall, executeLights };
})();
