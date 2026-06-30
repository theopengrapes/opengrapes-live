// Web Worker for off-thread screen share frame analysis
let prevPixels = null;
let offscreenCanvas = null;
let ctx = null;

const CANVAS_SIZE = 100; // 100x100 pixels is plenty for grid analysis

self.onmessage = function (event) {
  const { type, imageBitmap } = event.data;

  if (type === 'analyze' && imageBitmap) {
    try {
      // Lazy initialization of OffscreenCanvas inside worker
      if (!offscreenCanvas) {
        offscreenCanvas = new OffscreenCanvas(CANVAS_SIZE, CANVAS_SIZE);
        ctx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
      }

      if (!ctx) {
        imageBitmap.close();
        return;
      }

      // Draw the ImageBitmap to our small canvas (resizes automatically)
      ctx.drawImage(imageBitmap, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
      
      // Close the bitmap immediately to release graphics memory
      imageBitmap.close();

      // Retrieve pixel data
      const imageData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      const currentPixels = imageData.data;

      // First run: just save the pixels and return
      if (!prevPixels) {
        prevPixels = currentPixels;
        self.postMessage({ type: 'result', mode: 'static' });
        return;
      }

      // Compare pixel values
      let changedCount = 0;
      const totalPixels = CANVAS_SIZE * CANVAS_SIZE;
      const colorThreshold = 15; // Sensitivity threshold for color changes

      // Compare every pixel (10,000 comparisons is extremely fast, ~0.1-0.2ms in worker)
      for (let i = 0; i < currentPixels.length; i += 4) {
        const rDiff = Math.abs(currentPixels[i] - prevPixels[i]);
        const gDiff = Math.abs(currentPixels[i + 1] - prevPixels[i + 1]);
        const bDiff = Math.abs(currentPixels[i + 2] - prevPixels[i + 2]);

        if (rDiff > colorThreshold || gDiff > colorThreshold || bDiff > colorThreshold) {
          changedCount++;
        }
      }

      // Keep reference of current pixels for next comparison
      prevPixels = currentPixels;

      const changeRatio = changedCount / totalPixels;

      let mode = 'static';
      if (changeRatio > 0.75) {
        mode = 'scene-change'; // Massive change (likely alt-tab or window swap)
      } else if (changeRatio > 0.02) {
        mode = 'motion'; // Moderate change (scrolling, video, cursor movement)
      }

      self.postMessage({ type: 'result', mode, changeRatio });
    } catch (err) {
      console.error('[ScreenShareWorker] Error processing frame:', err);
      self.postMessage({ type: 'error', error: err.message });
    }
  } else if (type === 'reset') {
    prevPixels = null;
  }
};
