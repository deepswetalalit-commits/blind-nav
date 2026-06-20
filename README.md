# Blind-Nav: Multimodal Real-Time Spatial Assistive Navigation Engine

An intelligent, low-latency navigation framework designed to provide high-fidelity spatial awareness, object recognition, and safety mitigation for visually impaired individuals. The system leverages high-capacity multimodal AI models (Gemini Vision) combined with an eyes-free mobile interface pipeline—synthesizing physical device tracking with deep visual semantic understanding to deliver dynamic, conversational voice-guided routing instructions.

---

## 🛠️ System Architecture

The core framework acts as an intelligent bridge between edge-level device tracking, a specialized accessible smartphone application client, and upstream generative cloud intelligence.

### 1. Multimodal Scene Interpretation (Gemini Vision)
* **Real-Time Visual Context:** Rather than relying solely on raw numeric proximity calculations, the application utilizes streaming device camera frames parsed via the Gemini Vision API.
* **Semantic Object Analysis:** The AI pipeline identifies complex environmental entities (e.g., distinguishing between a door, a flight of stairs, or an oncoming vehicle) and extracts situational layout context that standard distance sensors miss.

### 2. Voice-Controlled Interface & Omnidirectional Input
* **100% Voice-Controlled Operation:** The entire system is navigated and operated via an integrated smartphone voice assistant, eliminating traditional multi-step menus or precise layout interactions.
* **Full-Screen Viewport Button:** Designed specifically for low-vision accessibility, the entire application interface acts as a single, macro-interactive button. A tap anywhere on the screen acts as an instantaneous input trigger (e.g., to activate listening modes or request immediate spatial updates), reducing cognitive load and mechanical friction.
* **Dynamic Conversational Routing:** Converts the output from the Gemini Vision scene analysis engine into clear, directional conversational prompts (e.g., *"Step to your left—a construction sign is blocking the path ahead in 3 meters"*).

---

## 🔒 Architectural Hardening & Safety Engineering

Designed from a safety-critical perspective, the system incorporates robust defensive layers to protect the user during unpredictable real-world scenarios:

* **Graceful Degradation & Network Fault-Tolerance:** The application client actively monitors network telemetry. If cellular data throughput drops below operational thresholds or a connection loss occurs, the system suppresses unexpected runtime exceptions or app crashes. Instead, it handles the exception gracefully by using the voice assistant interface to explicitly alert the user (*"Connection unstable, please check your network"*), holding application state securely until connectivity is restored.
* **Automated Emergency SOS Protocol:** Features an internal safety trigger that allows the user—via voice commands or critical system failure events—to automatically broadcast an emergency alert and initiate a direct call to pre-configured emergency contacts, ensuring an immediate lifeline during distress situations.
* **Token & Cost Management Guardrails:** Implements strict request debouncing and downsampling on the Gemini Vision API pipeline. This limits frame processing frequencies during low-velocity movement, protecting against API token depletion and Denial of Wallet (DoW) vectors.
* **Audio-Spatial Race Condition Prevention:** Protects the conversational text-to-speech loop from freezing during multiple concurrent sensor or API updates. Critical navigation cues are prioritized on an absolute interrupt basis.

---

1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
