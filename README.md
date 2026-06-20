# Blind-Nav: Multimodal Real-Time Spatial Assistive Navigation Engine

An intelligent, low-latency navigation framework designed to provide high-fidelity spatial awareness and obstacle mitigation for visually impaired individuals. The system leverages high-capacity multimodal AI models (Gemini Vision) combined with a mobile voice assistant pipeline to synthesize physical sensor tracking with deep visual semantic understanding—delivering dynamic, natural voice-guided routing instructions.

---

## 🛠️ System Architecture

The core framework acts as a bridge between edge-level device tracking, a smartphone application client, and upstream generative cloud intelligence.

### 1. Multimodal Scene Interpretation (Gemini Vision)
* **Real-Time Visual Context:** Rather than relying solely on raw numeric proximity data, the application utilizes streaming device camera frames parsed via the Gemini Vision API.
* **Semantic Analysis:** The AI pipeline identifies complex environmental entities (e.g., distinguishing between a door, a flight of stairs, or an oncoming vehicle) and extracts situational layout context that standard distance sensors miss.

### 2. Mobile Assistant Orchestration & Voice Guidance
* **Voice-Driven Core UI:** The system is operated entirely via an integrated smartphone voice assistant, eliminating the need for touch-screen navigation interfaces.
* **Dynamic Audio Routing:** Converts the output from the Gemini Vision scene analysis engine into clear, directional conversational prompts (e.g., *"Step to your left—a construction sign is blocked ahead in 3 meters"*).
* **Asynchronous Execution Loop:** Prioritizes critical safety alerts over general scene descriptions, dropping background conversation instantly if an immediate hazard is detected.

---

## 🔒 Architectural Hardening & Safety Engineering

Designed from a safety-critical engineering perspective, the system incorporates defensive layers to prevent runtime failures and data integrity issues:

* **Token & Cost Management Guardrails:** Implemented strict request debouncing and downsampling on the Gemini Vision API pipeline. This limits frame processing frequencies during low-velocity movement, protecting against API token depletion and Denial of Wallet (DoW) vectors.
* **Graceful Degradation / Fallback Layer:** The application client actively monitors network telemetry. If cellular data throughput drops below operational thresholds or a connection loss occurs, the system suppresses unexpected application crashes. Instead, it handles the exception gracefully by using the voice assistant interface to explicitly alert the user ("Connection unstable, please wait" or similar auditory status updates). This prevents terminal failures, manages user expectations during dead zones, and securely holds application state until network connectivity is re-established.
* **Audio-Spatial Race Condition Prevention:** Protects the conversational text-to-speech loop from freezing during multiple concurrent sensor updates. Critical navigation cues are prioritized on an absolute interrupt basis.

---



1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
