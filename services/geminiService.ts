import { GoogleGenAI, Modality } from "@google/genai";

interface ImageData {
  data: string;
  mimeType: string;
}

export async function removeWatermarkFromImage(imageData: ImageData): Promise<string | null> {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API_KEY environment variable is not set");
  }
  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: imageData.data,
              mimeType: imageData.mimeType,
            },
          },
          {
            text: 'ازل العلامة المائية من هذه الصورة',
          },
        ],
      },
      config: {
        responseModalities: [Modality.IMAGE],
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return part.inlineData.data;
      }
    }
    
    return null;
  } catch (error) {
    console.error("Error calling Gemini API for image editing:", error);
    throw new Error("Failed to process image with Gemini API.");
  }
}

export async function generateVideoFromFrame(imageData: ImageData, width: number, height: number): Promise<Blob | null> {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API_KEY environment variable is not set");
  }
  const ai = new GoogleGenAI({ apiKey });

  try {
    const ratio = width / height;
    const aspectRatio = ratio > 1 ? '16:9' : '9:16';
    
    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: 'Recreate a high-quality, realistic video based on this initial frame. The video should be a seamless continuation of the scene shown in the image.',
      image: {
        imageBytes: imageData.data,
        mimeType: imageData.mimeType,
      },
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: aspectRatio
      }
    });

    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      operation = await ai.operations.getVideosOperation({ operation: operation });
    }
    
    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) {
      throw new Error("Video generation succeeded, but no download link was provided.");
    }
    
    const response = await fetch(`${downloadLink}&key=${apiKey}`);
    if (!response.ok) {
        const errorBody = await response.text();
        console.error("Failed to download video:", errorBody);
        throw new Error(`Failed to download the generated video. Status: ${response.status}`);
    }

    const videoBlob = await response.blob();
    return videoBlob;

  } catch (error: any) {
    console.error("Error calling Veo API:", error);
    if (error.message && error.message.includes("Requested entity was not found")) {
        throw new Error("API_KEY_INVALID");
    }
    throw new Error("Failed to process video with Veo API.");
  }
}