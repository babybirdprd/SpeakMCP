import { WakeWordDetector } from './packages/wakeword-engine/index.js';
import * as fs from 'fs';

console.log("Loading WakeWordDetector...");

// Use a dummy path. It should fail gracefully or with "Failed to load model".
// If it fails with "libonnxruntime not found", then we know.

try {
    const detector = new WakeWordDetector("dummy_path.onnx");
    console.log("Detector created (unexpectedly, path is dummy)");
} catch (e) {
    console.log("Detector creation failed as expected:", e.message);
    if (e.message && e.message.includes("onnxruntime")) {
        console.error("CRITICAL: ONNX Runtime library issue!");
        process.exit(1);
    }
}

console.log("Creating dummy buffer...");
const buffer = new Float32Array(16000); // 1 sec silence

console.log("Verification passed (logic load).");
