
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
      description: "Short, imperative command for a blind user (e.g., 'Stop', 'Veer left', 'Step up').",
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

export const analyzeSafety = async (base64Image: string): Promise<HazardAnalysis> => {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    console.warn("API_KEY is missing. Please set VITE_API_KEY in environment variables.");
    return {
      detected_hazard: "Configuration Error",
      urgency: "caution",
      position: "center",
      instruction: "Missing VITE_API_KEY in settings.",
    };
  }

  const ai = new GoogleGenAI({ apiKey });

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
              You are a navigation assistant for a visually impaired person. 
              Analyze the image from their chest-mounted camera.
              Focus ONLY on the immediate path ahead (ground level and head height).
              Identify hazards like stairs, poles, people, cars, or walls.
              If the path is clear, urgency is 'safe'.
              If there is an obstacle, determine if it requires a stop (danger) or a slight turn (caution).
            `,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: HAZARD_SCHEMA,
        systemInstruction: "You are a safety guide. Be conservative. Safety is priority #1.",
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
      instruction: "Stop and check connection",
    };
  }
};
