export function fileToBase64(file: File): Promise<{ data: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const base64String = reader.result.split(',')[1];
        resolve({ data: base64String, mimeType: file.type });
      } else {
        reject(new Error('Failed to read file as base64 string.'));
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

export function extractFirstFrame(videoFile: File): Promise<{ data: string; mimeType: 'image/jpeg'; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const videoUrl = URL.createObjectURL(videoFile);
    video.src = videoUrl;
    video.muted = true;
    
    let resolved = false;

    const cleanup = () => {
        video.pause();
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(videoUrl);
    };

    video.onloadeddata = () => {
      // Seek to a point that's not exactly 0 to avoid potential black frames
      video.currentTime = 0.1;
    };

    video.onseeked = () => {
      if (resolved) return;
      resolved = true;
      
      const canvas = document.createElement('canvas');
      const { videoWidth, videoHeight } = video;
      canvas.width = videoWidth;
      canvas.height = videoHeight;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        cleanup();
        return reject(new Error('Could not get canvas context.'));
      }
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      cleanup();
      
      const base64String = dataUrl.split(',')[1];
      resolve({ data: base64String, mimeType: 'image/jpeg', width: videoWidth, height: videoHeight });
    };

    video.onerror = (err) => {
      if (resolved) return;
      cleanup();
      reject(err);
    };

    video.play().catch(err => {
        if (resolved) return;
        cleanup();
        reject(err);
    });
  });
}