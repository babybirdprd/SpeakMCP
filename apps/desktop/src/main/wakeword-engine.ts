import vosk from 'vosk'
import recorder from 'node-record-lpcm16'
import path from 'path'
import { app } from 'electron'
import { EventEmitter } from 'events'
import fs from 'fs'

export class WakeWordEngine extends EventEmitter {
  private model: vosk.Model | null = null
  private recognizer: vosk.Recognizer | null = null
  private recording: any = null
  private currentWakeWord: string = 'jarvis'
  private isListening: boolean = false

  constructor() {
    super()
    this.initializeModel()
  }

  private initializeModel() {
    try {
      // Determine the path to the model based on whether the app is packaged
      const modelPath = app.isPackaged
        ? path.join(process.resourcesPath, 'models/vosk-model-small-en-us')
        : path.join(app.getAppPath(), 'resources/models/vosk-model-small-en-us')

      if (!fs.existsSync(modelPath)) {
        console.error(`[WakeWordEngine] Model not found at: ${modelPath}`)
        return
      }

      // Initialize the model
      vosk.setLogLevel(-1) // Suppress Vosk logs
      this.model = new vosk.Model(modelPath)
      console.log(`[WakeWordEngine] Model initialized from: ${modelPath}`)
    } catch (error) {
      console.error('[WakeWordEngine] Failed to initialize model:', error)
    }
  }

  public setWakeWord(wakeWord: string) {
    this.currentWakeWord = wakeWord.toLowerCase()
    if (this.isListening) {
      // Restart listening to update grammar
      this.stopListening()
      this.startListening()
    }
  }

  public startListening() {
    if (!this.model) {
      console.error('[WakeWordEngine] Model not initialized, cannot start listening')
      return
    }

    if (this.isListening) {
      return
    }

    try {
      // Initialize recognizer with restricted grammar
      if (this.recognizer) {
        this.recognizer.free()
      }
      this.recognizer = new vosk.Recognizer({
        model: this.model,
        sampleRate: 16000,
        grammar: [this.currentWakeWord, '[unkn]']
      })

      // Start microphone stream
      this.recording = recorder.record({
        sampleRate: 16000,
        threshold: 0,
        verbose: false,
        // Let it default to 'sox' or 'rec' or 'arecord'
      })

      const stream = this.recording.stream()

      stream.on('data', (data: Buffer) => {
        if (this.recognizer && this.recognizer.acceptWaveform(data)) {
          const result = this.recognizer.result()
          // @ts-ignore - vosk types might be incomplete
          if (result.text === this.currentWakeWord) {
            console.log('[WakeWordEngine] Wake word detected!')
            this.emit('wake-word-detected')
          }
        }
      })

      stream.on('error', (error: any) => {
        console.error('[WakeWordEngine] Microphone stream error:', error)
      })

      this.isListening = true
      console.log(`[WakeWordEngine] Started listening for wake word: ${this.currentWakeWord}`)

    } catch (error) {
      console.error('[WakeWordEngine] Failed to start listening:', error)
      this.isListening = false
    }
  }

  public stopListening() {
    if (this.recording) {
      this.recording.stop()
      this.recording = null
    }

    if (this.recognizer) {
      // Don't free the model, just the recognizer if we want to save resources,
      // but usually we keep it unless we are destroying the engine.
      // Actually, we should probably free the recognizer to stop processing.
      this.recognizer.free()
      this.recognizer = null
    }

    this.isListening = false
    console.log('[WakeWordEngine] Stopped listening')
  }

  public dispose() {
    this.stopListening()
    if (this.model) {
      this.model.free()
      this.model = null
    }
  }
}
