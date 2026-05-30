import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Lazy initialization of the Gemini client
let aiClient: GoogleGenAI | null = null;
function getAi() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not defined in Secrets.");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

const SYSTEM_INSTRUCTION = `You are a helpful, professional, and knowledgeable Google Maps AI Chatbot.
You use live, real-time Google Maps search data to answer geographic queries, recommend places, find the best local attractions (restaurants, museums, cafes), and provide route information.

RESPONDING INSTRUCTIONS:
1. Maintain an objective, engaging, and friendly tone. Explain your recommendations fully in clean Markdown format with headings, bullet points, and description lists.
2. Rely on the 'googleMaps' search grounding tool for up-to-date, live, and accurate details. Do not guess coordinates or make up directories/address details.
3. CRITICAL INTEGRATION REQUIREMENT: If you mention any physical places with specific positions/addresses, or provide routing guidance, you MUST append a valid JSON block at the absolute end of your response inside a markdown code block tagged like this:
\`\`\`map-data
{
  "center": { "lat": number, "lng": number },
  "zoom": number,
  "markers": [
    {
      "id": "unique-place-id-slug-1",
      "title": "Place Name",
      "address": "Full physical address of the place",
      "lat": number,
      "lng": number,
      "description": "Short 1-sentence highlight explaining why it's recommended."
    }
  ],
  "route": {
    "origin": "Origin address or Latitude,Longitude",
    "destination": "Destination address or Latitude,Longitude",
    "travelMode": "DRIVING"
  }
}
\`\`\`
Replace the properties above with real coordinates and data matching the physical places you discussed in your text response.
The values under 'travelMode' can be 'DRIVING', 'WALKING', 'BICYCLING', or 'TRANSIT'.
The 'route' property is optional; only include it if the user asked for routes, navigation, directions, or distances between two places.
If no specific physical locations or routes are relevant to the user's message, do not output any \`\`\`map-data code block.
4. Do not output any notes, descriptions, or commentary inside or immediately around the \`\`\`map-data code block itself. The inside of the code block must be strictly valid JSON.`;

// API routes first
app.post("/api/chat", async (req, res) => {
  try {
    const { messages, currentCenter } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Invalid messages array provided." });
    }

    const ai = getAi();

    // Map the conversation history to Gemini content structure (assistant -> model)
    const contents = messages.map((msg: any) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    const config: any = {
      systemInstruction: SYSTEM_INSTRUCTION,
      tools: [{ googleMaps: {} }],
    };

    if (currentCenter && typeof currentCenter.lat === "number" && typeof currentCenter.lng === "number") {
      config.toolConfig = {
        retrievalConfig: {
          latLng: {
            latitude: currentCenter.lat,
            longitude: currentCenter.lng,
          },
        },
      };
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents,
      config,
    });

    const text = response.text || "I was unable to retrieve a response.";
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    // Filter and format grounding citations to return to frontend
    const citations = chunks
      .map((chunk: any) => {
        if (chunk.web) {
          return { uri: chunk.web.uri, title: chunk.web.title };
        } else if (chunk.maps) {
          return { uri: chunk.maps.uri, title: chunk.maps.title };
        }
        return null;
      })
      .filter(Boolean);

    res.json({
      text,
      citations,
    });
  } catch (error: any) {
    console.error("Error in /api/chat:", error);
    res.status(500).json({
      error: error.message || "An unexpected error occurred on the server.",
    });
  }
});

// Configure Vite or serve static production bundle
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Google Maps AI Chatbot running on port ${PORT}`);
  });
}

startServer();
