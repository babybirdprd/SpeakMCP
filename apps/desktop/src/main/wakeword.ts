import { WakeWordDetector } from "wakeword-engine";
import path from "path";
import { app } from "electron";
import { logApp } from "./debug";

let detector: WakeWordDetector | null = null;

export function initWakeWord() {
  try {
    // Model path - in production, likely in resources
    const modelPath = path.join(process.resourcesPath || app.getAppPath(), "resources", "alexa.onnx");

    // In dev, maybe somewhere else?
    // For now, we point to a dummy path if not found, to trigger error handling.

    detector = new WakeWordDetector(modelPath);
    logApp(`Wake Word Detector initialized with model: ${modelPath}`);

    // Mock Audio Stream (Simulated)
    // In real implementation, this would hook into microphone stream
    // Since we don't have audio stream setup in Main, we just log that we are ready.
    // To properly test, we would need to feed it data.

    simulateAudioStream();

  } catch (error) {
    logApp(`Failed to initialize Wake Word Detector: ${error}`);
    // Do not crash
  }
}

function simulateAudioStream() {
  if (!detector) return;

  // Simulate checking every 1s
  setInterval(() => {
    try {
      // Create silent buffer
      const buffer = new Float32Array(1600); // 100ms at 16k
      const detected = detector?.process_audio(buffer);
      if (detected) {
        logApp("Wake Word Detected! (False positive expected on silence if model bad or logic buggy, but here input is silence)");
      }
    } catch (e) {
      logApp(`Error processing audio: ${e}`);
    }
  }, 1000);
}
