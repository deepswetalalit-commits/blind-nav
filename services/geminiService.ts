
import { GoogleGenAI, Type } from "@google/genai";
import { HazardAnalysis } from "../types";

const HAZARD_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    detected_hazard: {
      type: Type.STRING,
      description: "The name of the primary obstacle or 'Clear Path' if safe.",
    },
    urgency: {
      type: Type.STRING,
      enum: ["safe", "caution", "danger"],
      description: "Immediate safety level.",
    },
    position: {
      type: Type.STRING,
      enum: ["left", "center", "right", "none"],
      description: "Where the object is relative to the user's forward path.",
    },
    instruction: {
      type: Type.STRING,
      description: "Short, imperative command. If object is < 35cm away, say 'STOP IMMEDIATE'.",
    },
  },
  required: ["detected_hazard", "urgency", "position", "instruction"],
};

const getApiKey = () => {
  // 1. Check Import Meta (Vite)
  try {
    const metaEnv = (import.meta as any).env;
    if (metaEnv) {
      if (metaEnv.VITE_API_KEY) return metaEnv.VITE_API_KEY;
      if (metaEnv.API_KEY) return metaEnv.API_KEY;
    }
  } catch (e) {}

  // 2. Check Process Env
  try {
    if (typeof process !== 'undefined' && process.env) {
      if (process.env.VITE_API_KEY) return process.env.VITE_API_KEY;
      if (process.env.API_KEY) return process.env.API_KEY;
    }
  } catch (e) {}

  return undefined;
};

// Singleton Client
let aiClient: GoogleGenAI | null = null;

const getAiClient = () => {
  if (aiClient) return aiClient;
  
  const apiKey = getApiKey();
  if (!apiKey) return null;
  
  aiClient = new GoogleGenAI({ apiKey });
  return aiClient;
};

// Standard Safety Analysis (JSON)
export const analyzeSafety = async (base64Image: string): Promise<HazardAnalysis> => {
  const ai = getAiClient();
  
  if (!ai) {
    console.warn("API_KEY is missing. Please set VITE_API_KEY in environment variables.");
    return {
      detected_hazard: "Configuration Error",
      urgency: "caution",
      position: "center",
      instruction: "Missing VITE_API_KEY in settings.",
    };
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Image,
            },
          },
          {
            text: `
              CRITICAL SAFETY ANALYSIS:
              1. If any object covers >70% of the image (approx 30-35cm away), return urgency="danger" and instruction="STOP. Too close.".
              2. Identify stairs, drop-offs, or head-level obstacles.
              3. If safe, return urgency="safe".
            `,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: HAZARD_SCHEMA,
        systemInstruction: "You are a guide for a blind person. Prioritize collisions within 1 meter. Be concise.",
        thinkingConfig: { thinkingBudget: 0 } 
      },
    });

    if (response.text) {
      return JSON.parse(response.text) as HazardAnalysis;
    }
    
    throw new Error("No response text");
  } catch (error) {
    console.error("Gemini analysis failed:", error);
    // Fallback for safety
    return {
      detected_hazard: "Connection Error",
      urgency: "caution", 
      position: "center",
      instruction: "Checking connection...",
    };
  }
};

// Visual Query Assistant (Free-form Text)
export const queryVisualScene = async (base64Image: string, userQuery: string): Promise<string> => {
  const ai = getAiClient();
  if (!ai) return "Configuration Error: API Key missing.";

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Image,
            },
          },
          {
            text: `User Question: "${userQuery}". Answer concisely for a blind user. Locate items relative to the user (e.g. 'on your left').`,
          },
        ],
      },
      config: {
        systemInstruction: "You are a helpful visual assistant. Keep answers under 15 words. Be direct.",
        thinkingConfig: { thinkingBudget: 0 }
      },
    });

    return response.text || "I couldn't see that clearly.";
  } catch (error) {
    console.error("Visual Query failed:", error);
    return "I had trouble seeing that.";
  }
};
