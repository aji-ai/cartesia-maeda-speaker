import { CartesiaClient, WebPlayer } from '@cartesia/cartesia-js';
import { OpenAI } from 'openai';

let client = null;
let player = null;
let webSocket = null;
let recognition = null;
let isRecording = false;
let avatarInterval = null;
const avatarImages = ['maedaclosed.jpg', 'maedaopenlittle.jpg', 'maedaopen.jpg'];
const avatarElement = document.querySelector('.avatar');

let conversationHistory = [];
let turnCounter = 0;
const turnCounterElement = document.getElementById('turn-counter');

// Initialize from saved API keys if available
const savedCartesiaKey = localStorage.getItem('cartesiaKey');
const savedOpenAIKey = localStorage.getItem('openaiKey');
if (savedCartesiaKey) {
  document.getElementById('api-key').value = savedCartesiaKey;
  initCartesia(savedCartesiaKey);
}
if (savedOpenAIKey) {
  document.getElementById('openai-key').value = savedOpenAIKey;
}

// Initialize Speech Recognition
function initSpeechRecognition() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    alert('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
    return;
  }

  // Use the standard SpeechRecognition or the webkit prefix
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  
  // Configure recognition
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  // Handle results
  recognition.onresult = (event) => {
    const textarea = document.getElementById('text-input');
    let interimTranscript = '';
    let finalTranscript = '';

    // Collect the results
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }

    // If we have final transcript, append it to the textarea
    if (finalTranscript) {
      const cursorPosition = textarea.selectionStart;
      const textBeforeCursor = textarea.value.substring(0, cursorPosition);
      const textAfterCursor = textarea.value.substring(cursorPosition);
      
      textarea.value = textBeforeCursor + finalTranscript + ' ' + textAfterCursor;
      
      // Move cursor to end of inserted text
      const newPosition = cursorPosition + finalTranscript.length + 1;
      textarea.selectionStart = newPosition;
      textarea.selectionEnd = newPosition;
    }
  };

  // Handle errors
  recognition.onerror = (event) => {
    if (event.error === 'audio-capture') {
      alert('No microphone was found. Ensure that a microphone is installed.');
    } else if (event.error === 'not-allowed') {
      alert('Microphone permission was denied.');
    }
    stopRecording();
  };

  // Handle end of recognition
  recognition.onend = () => {
    if (isRecording) {
      recognition.start();
    }
  };
}

// Toggle recording
function toggleRecording() {
  if (!recognition) {
    initSpeechRecognition();
  }

  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

// Start recording
function startRecording() {
  if (!recognition) {
    initSpeechRecognition();
  }
  
  // Clear the textarea before starting recording
  document.getElementById('text-input').value = '';
  
  recognition.start();
  isRecording = true;
  document.getElementById('mic-button').classList.add('recording');
}

// Stop recording
function stopRecording() {
  if (recognition) {
    recognition.stop();
  }
  isRecording = false;
  document.getElementById('mic-button').classList.remove('recording');
  // After stopping, wait a brief moment for any final transcriptions to complete
  setTimeout(() => {
    cleanText(); // Automatically clean the text
  }, 500);
}

// Initialize Cartesia
function initCartesia(apiKey) {
  try {
    console.log('Initializing Cartesia with API key...');
    client = new CartesiaClient({ apiKey });
    player = new WebPlayer({
      bufferDuration: 0.1, // 100ms buffer
      sampleRate: 44100,
      channels: 1
    });
    console.log('Cartesia initialized successfully');
  } catch (error) {
    console.error('Error initializing Cartesia:', error);
    alert('Failed to initialize Cartesia: ' + error.message);
  }
}

// Get text from textarea
function getText(all = false) {
  const textarea = document.getElementById('text-input');
  let text;
  
  // Get selected text if there is a selection and not reading all
  if (!all && textarea.selectionStart !== textarea.selectionEnd) {
    text = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd).trim();
  } else {
    // If no selection or reading all, get all text
    text = textarea.value.trim();
  }
  
  console.log('Text to read:', text);
  // Refocus the textarea and restore selection
  textarea.focus();
  return text;
}

// Stream speech using WebSocket
async function streamSpeech(text) {
  if (!client) {
    console.error('Cartesia client not initialized');
    alert('Please enter your Cartesia API key first');
    return;
  }
  
  try {
    console.log('Initializing WebSocket connection...');
    startAvatarAnimation(); // Start avatar animation
    
    // Initialize WebSocket
    webSocket = client.tts.websocket({
      container: "raw",
      encoding: "pcm_f32le",
      sampleRate: 44100,
    });
    
    console.log('Connecting to WebSocket...');
    await webSocket.connect();
    console.log('WebSocket connected successfully');
    
    // Create stream
    console.log('Sending TTS request...');
    const response = await webSocket.send({
      modelId: "sonic-2",
      voice: {
        mode: "id",
        id: "cee3fd47-2753-4555-b577-966d9979a527",
      },
      transcript: text,
      language: "en",
    });
    
    console.log('TTS response received, starting playback...');
    await player.play(response.source);
    console.log('Finished playing');
    
  } catch (error) {
    console.error('Detailed error:', error);
    alert('Error: ' + error.message + '\nPlease check the console for more details.');
  } finally {
    stopAvatarAnimation(); // Stop avatar animation when done or on error
  }
}

// OpenAI Integration
const aiResponseButton = document.getElementById('ai-response');
let isGenerating = false;

async function streamAIResponse() {
  if (isGenerating) return;
  
  const apiKey = document.getElementById('openai-key').value;
  if (!apiKey) {
    alert('Please enter your OpenAI API key first');
    return;
  }

  const textarea = document.getElementById('text-input');
  const userInput = textarea.value;

  try {
    isGenerating = true;
    aiResponseButton.classList.add('loading');
    
    const openai = new OpenAI({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true
    });

    // Build the conversation history array
    const messages = [
      {
        role: 'system',
        content: `You are John Maeda, MIT Media Lab alum and design technologist. IMPORTANT: Respond with EXACTLY 1 SENTENCE ONLY. NO MORE.

Style guide:
- Use simple language for complex ideas
- Make each sentence concise but meaningful
- Use concrete metaphors from technology and design
- Connect computational thinking with human experience
- Respond with quiet authority while showing humility

Remember: Maximum one sentences. No exceptions.`
      }
    ];

    // Add each turn from the conversation history
    conversationHistory.forEach(turn => {
      messages.push({ role: 'user', content: turn.input });
      messages.push({ role: 'assistant', content: turn.response });
    });

    // Add the current user input
    messages.push({ role: 'user', content: userInput });

    console.log('Sending conversation with history:', messages);

    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      stream: true,
      max_tokens: 100,
      temperature: 0.7
    });

    // Clear the textarea
    textarea.value = '';
    let response_text = '';

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      response_text += content;
      textarea.value = response_text;
      textarea.scrollTop = textarea.scrollHeight;
    }

    // Add the new turn to conversation history
    conversationHistory.push({
      input: userInput,
      response: response_text
    });
    
    // Update turn counter
    turnCounter++;
    turnCounterElement.textContent = turnCounter;

    console.log('Updated conversation history:', conversationHistory);

  } catch (error) {
    console.error('OpenAI API Error:', error);
    alert('Error generating AI response. Please check your API key and try again.');
    textarea.value = userInput;
  } finally {
    isGenerating = false;
    aiResponseButton.classList.remove('loading');
  }
}

aiResponseButton.addEventListener('click', streamAIResponse);

async function cleanText() {
  const apiKey = document.getElementById('openai-key').value;
  if (!apiKey) {
    alert('Please enter your OpenAI API key first');
    return;
  }

  const textarea = document.getElementById('text-input');
  const originalText = textarea.value;

  try {
    const cleanButton = document.getElementById('clean-text');
    cleanButton.classList.add('loading');
    
    const openai = new OpenAI({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true
    });

    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a text editor that fixes text formatting and spelling. Your task is to:
1. Fix any spelling mistakes
2. Properly segment text into sentences
3. Fix grammatical errors
4. Maintain the original meaning and tone
5. Return the cleaned text only, no explanations
6. Anything that sounds like "Design in Tech Report" should be just that instead of "Design and tech" etc.
7. Anything that sounds like "Jon Iwata" or "John Water" should be expressed as Jon Iwata.
Keep the text natural - don't make it overly formal.`
        },
        {
          role: 'user',
          content: originalText
        }
      ],
      stream: true,
      temperature: 0.3
    });

    // Clear the textarea
    textarea.value = '';
    let cleaned_text = '';

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      cleaned_text += content;
      textarea.value = cleaned_text;
      textarea.scrollTop = textarea.scrollHeight;
    }

  } catch (error) {
    console.error('OpenAI API Error:', error);
    alert('Error cleaning text. Please check your API key and try again.');
    textarea.value = originalText;
  } finally {
    document.getElementById('clean-text').classList.remove('loading');
  }
}

// Add event listener for clean button
document.getElementById('clean-text').addEventListener('click', cleanText);

// Event listeners
document.getElementById('save-key').addEventListener('click', () => {
  const key = document.getElementById('api-key').value.trim();
  if (key) {
    localStorage.setItem('cartesiaKey', key);
    initCartesia(key);
    alert('API key saved');
  }
});

document.getElementById('save-openai-key').addEventListener('click', () => {
  const key = document.getElementById('openai-key').value.trim();
  if (key) {
    localStorage.setItem('openaiKey', key);
    alert('OpenAI API key saved');
  }
});

document.getElementById('read-all').addEventListener('click', (e) => {
  e.preventDefault();
  const text = getText(true);
  if (text) {
    streamSpeech(text);
  } else {
    alert('Please enter some text first');
  }
});

document.getElementById('read-selected').addEventListener('click', (e) => {
  e.preventDefault();
  const text = getText(false);
  if (text) {
    streamSpeech(text);
  } else {
    alert('Please select some text first');
  }
});

document.getElementById('stop').addEventListener('click', (e) => {
  e.preventDefault();
  if (player) {
    player.stop();
    document.getElementById('text-input').focus();
  }
});

document.getElementById('clear').addEventListener('click', (e) => {
  e.preventDefault();
  const textarea = document.getElementById('text-input');
  textarea.value = '';
  textarea.focus();
});

document.getElementById('mic-button').addEventListener('click', (e) => {
  e.preventDefault();
  toggleRecording();
});

function startAvatarAnimation() {
  if (avatarInterval) return;
  
  avatarInterval = setInterval(() => {
    // Randomly select one of the open mouth images
    const randomImage = Math.random() < 0.5 ? 'maedaopenlittle.jpg' : 'maedaopen.jpg';
    avatarElement.src = randomImage;
    
    // Small chance to show closed mouth briefly
    if (Math.random() < 0.2) {
      setTimeout(() => {
        avatarElement.src = 'maedaclosed.jpg';
      }, 50);
    }
  }, 150);
}

function stopAvatarAnimation() {
  if (avatarInterval) {
    clearInterval(avatarInterval);
    avatarInterval = null;
  }
  avatarElement.src = 'maedaclosed.jpg';
}

// Modify the existing play function to include avatar animation
async function play(text) {
  try {
    if (!client) {
      alert('Please enter your API key first');
      return;
    }

    startAvatarAnimation();
    
    const response = await client.synthesize(text);
    await player.play(response);
    
    stopAvatarAnimation();
  } catch (error) {
    console.error('Error playing audio:', error);
    stopAvatarAnimation();
  }
}

// Show conversation history
function showHistory() {
  const modal = document.getElementById('history-modal');
  const container = document.getElementById('history-container');
  container.innerHTML = ''; // Clear existing content

  if (conversationHistory.length === 0) {
    container.innerHTML = '<div class="history-item">No conversation history yet.</div>';
  } else {
    conversationHistory.forEach((turn, index) => {
      // User message
      const userDiv = document.createElement('div');
      userDiv.className = 'history-item user';
      userDiv.innerHTML = `
        <div class="history-label">You:</div>
        <div>${turn.input}</div>
      `;
      container.appendChild(userDiv);

      // Assistant message
      const assistantDiv = document.createElement('div');
      assistantDiv.className = 'history-item assistant';
      assistantDiv.innerHTML = `
        <div class="history-label">John Maeda:</div>
        <div>${turn.response}</div>
      `;
      container.appendChild(assistantDiv);
    });
  }

  modal.style.display = 'block';
}

// Close modal when clicking the close button or outside the modal
function setupModalListeners() {
  const modal = document.getElementById('history-modal');
  const closeBtn = document.querySelector('.close-modal');

  closeBtn.onclick = function() {
    modal.style.display = 'none';
  }

  window.onclick = function(event) {
    if (event.target === modal) {
      modal.style.display = 'none';
    }
  }
}

// Add event listeners
document.getElementById('show-history').addEventListener('click', showHistory);
setupModalListeners();

// Update clearHistory function to also close the modal
function clearHistory() {
  conversationHistory = [];
  turnCounter = 0;
  turnCounterElement.textContent = '0';
  document.getElementById('text-input').value = '';
  document.getElementById('history-modal').style.display = 'none';
}

// Add event listeners
document.getElementById('clear-history').addEventListener('click', clearHistory);

// Add this to your main.js or in a script tag
document.addEventListener('DOMContentLoaded', function() {
  const urlParams = new URLSearchParams(window.location.search);
  const hideIcons = urlParams.get('hideIcons');
  
  if (hideIcons === 'true') {
    // Add CSS rule to hide icons
    const style = document.createElement('style');
    style.textContent = `
      .cartesia-logo, .openai-logo {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  }
}); 