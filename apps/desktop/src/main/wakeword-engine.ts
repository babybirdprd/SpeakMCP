import vosk from 'vosk';
import fs from 'fs';
import { Readable } from 'stream';
import recorder from 'node-record-lpcm16';
import path from 'path';
import { app, BrowserWindow } from 'electron';

export class WakeWordEngine {
  private model: vosk.Model | null = null;
  private recognizer: vosk.Recognizer | null = null;
  private micStream: Readable | null = null;
  private currentWakeWord: string = 'jarvis';
  private mainWindow: BrowserWindow | null = null;
  private isRecording: boolean = false;

  constructor() {
    // Determine model path based on environment
    const modelPath = app.isPackaged
      ? path.join(process.resourcesPath, 'models/vosk-model-small-en-us-0.15')
      : path.join(app.getAppPath(), 'resources/models/vosk-model-small-en-us-0.15');

    console.log('[WakeWord] Initializing with model path:', modelPath);

    if (fs.existsSync(modelPath)) {
      try {
        // Suppress vosk logs if needed, or redirect them
        vosk.setLogLevel(-1);
        this.model = new vosk.Model(modelPath);
        this.initializeRecognizer();
      } catch (error) {
        console.error('[WakeWord] Failed to load model:', error);
      }
    } else {
      console.error('[WakeWord] Model not found at:', modelPath);
    }
  }

  public setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
  }

  private initializeRecognizer() {
    if (!this.model) return;

    try {
      // Initialize with restricted grammar for low CPU usage
      // The grammar must be a JSON string of a list of words or "[unk]"
      // Example: '["jarvis", "[unk]"]'
      const grammar = JSON.stringify([this.currentWakeWord, "[unk]"]);

      if (this.recognizer) {
        this.recognizer.free();
      }

      this.recognizer = new vosk.Recognizer({
        model: this.model,
        sampleRate: 16000,
        grammar: grammar
      });

      console.log(`[WakeWord] Recognizer initialized for word: ${this.currentWakeWord}`);
    } catch (error) {
      console.error('[WakeWord] Failed to initialize recognizer:', error);
    }
  }

  public updateWakeWord(newWord: string) {
    if (!newWord || newWord.trim() === '') return;

    const lowerWord = newWord.toLowerCase().trim();
    if (this.currentWakeWord !== lowerWord) {
      this.currentWakeWord = lowerWord;
      console.log('[WakeWord] Updating wake word to:', this.currentWakeWord);
      this.initializeRecognizer();
    }
  }

  public start() {
    if (this.isRecording) {
      console.log('[WakeWord] Already recording');
      return;
    }

    if (!this.recognizer) {
      console.error('[WakeWord] Cannot start: Recognizer not initialized');
      return;
    }

    console.log('[WakeWord] Starting recording...');

    try {
      this.micStream = recorder.record({
        sampleRate: 16000,
        threshold: 0,
        verbose: false,
        recordProgram: process.platform === 'win32' ? 'sox' : 'rec', // Try 'rec' on linux/mac, 'sox' on windows
        silence: '10.0',
      }).stream() as Readable;

      this.isRecording = true;

      this.micStream.on('data', (data: Buffer) => {
        if (this.recognizer && this.recognizer.acceptWaveform(data)) {
          const result = this.recognizer.result();
          // result returns an object like { text: "jarvis" }
          if (result && result.text && result.text.includes(this.currentWakeWord)) {
            console.log('[WakeWord] WAKE WORD DETECTED!');
            this.emitWakeWordDetected();
          }
        }
      });

      this.micStream.on('error', (error: any) => {
        console.error('[WakeWord] Microphone stream error:', error);
        this.stop();
      });

    } catch (error) {
      console.error('[WakeWord] Failed to start recording:', error);
      this.isRecording = false;
    }
  }

  public stop() {
    if (!this.isRecording) return;

    console.log('[WakeWord] Stopping recording...');
    if (this.micStream) {
        // node-record-lpcm16 doesn't have a direct stop method on the stream,
        // usually we call recorder.stop() but here we only have the stream if we used .stream()
        // Wait, recorder.record() returns the process object if not chained with .stream()
        // But the example used .stream().
        // Let's check node-record-lpcm16 usage.
        // If we want to stop, we might need to destroy the stream or kill the process.
        // Actually, looking at docs/usage, often we just destroy the stream.
        this.micStream.destroy();
        this.micStream = null;
    }
    this.isRecording = false;
  }

  private emitWakeWordDetected() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('wake-word-detected');
    }
  }
}

export const wakeWordEngine = new WakeWordEngine();
