const axios = require('axios');

class NanoBananaService {
  constructor() {
    this.baseUrl = 'https://api.nanobanana.com/v1'; // Placeholder URL
    this.apiKey = null; // To be set via config
  }

  setApiKey(key) {
    this.apiKey = key;
  }

  async generateImage(prompt, model = 'gemini-2.0-flash-exp') {
    if (!this.apiKey) {
      console.warn('[NanoBanana] No API key provided');
      return {
        success: false,
        error: 'API Key missing. Please configure your Gemini API key in settings.'
      };
    }

    console.log(`[NanoBanana] Generating image with model ${model} for prompt: ${prompt}`);

    try {
      // Official Gemini Image Generation Endpoint
      // Docs: https://ai.google.dev/gemini-api/docs/image-generation
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

      const response = await axios.post(url, {
        contents: [
          {
            parts: [
              { text: prompt }
            ]
          }
        ],
        generationConfig: {
          responseModalities: ["IMAGE"],
          // Optional: Add imageConfig if needed, e.g., aspectRatio: "1:1"
        }
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.data &&
        response.data.candidates &&
        response.data.candidates.length > 0 &&
        response.data.candidates[0].content &&
        response.data.candidates[0].content.parts &&
        response.data.candidates[0].content.parts.length > 0) {

        // Find the part with inlineData (the image)
        const imagePart = response.data.candidates[0].content.parts.find(p => p.inlineData);

        if (imagePart && imagePart.inlineData) {
          const base64Image = imagePart.inlineData.data;
          const mimeType = imagePart.inlineData.mimeType || 'image/png';

          return {
            success: true,
            imageUrl: `data:${mimeType};base64,${base64Image}`,
            model: model
          };
        }
      }

      console.error('[NanoBanana] Unexpected API response:', JSON.stringify(response.data, null, 2));
      return {
        success: false,
        error: 'Failed to generate image. No image data found in response.'
      };

    } catch (error) {
      console.error('[NanoBanana] API Error:', error.response ? error.response.data : error.message);

      let errorMessage = error.message;
      if (error.response && error.response.data && error.response.data.error) {
        errorMessage = error.response.data.error.message || JSON.stringify(error.response.data.error);
      }

      return {
        success: false,
        error: `Image generation failed: ${errorMessage}`
      };
    }
  }

  async generateDiagram(topic, style = 'educational') {
    const prompt = `
      Create a highly detailed and accurate educational diagram explaining: "${topic}".
      
      Context & Intent:
      - The goal is to visually explain this concept to a student.
      - The image should be clear, uncluttered, and focus on the key mechanism or relationship.
      - Emotion/Vibe: Professional, clear, engaging, and scientifically accurate.
      
      Visual Elements:
      - Use clear labels and arrows to show flow or parts.
      - Use a clean color palette (educational style).
      - Ensure text is legible if included.
      
      Style: ${style}
      
      Output Requirement:
      - Generate a single, high-quality image that perfectly matches this description.
    `.trim();

    return this.generateImage(prompt, 'gemini-2.0-flash-exp');
  }
}

module.exports = NanoBananaService;
