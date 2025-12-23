import { Model, Recognizer, setLogLevel } from 'vosk'
import fs from 'fs'
import path from 'path'
import { app, BrowserWindow, ipcMain } from 'electron'
import * as recorder from 'node-record-lpcm16'

// Vosk uses native modules, so we need to ensure the path is correct in production
const MODEL_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'models/vosk-model-small-en-us')
  : path.join(app.getAppPath(), 'resources/models/vosk-model-small-en-us')

let model: Model | null = null
let rec: Recognizer | null = null
let currentWakeWord = 'speak' // default
let micInstance: any = null

export function initializeWakeWord(window: BrowserWindow) {
  if (!fs.existsSync(MODEL_PATH)) {
    console.error(`Model not found at ${MODEL_PATH}`)
    return
  }

  // Set log level to -1 to suppress Vosk logs
  setLogLevel(-1)

  try {
    model = new Model(MODEL_PATH)

    // Initialize with a restricted grammar for efficiency
    // The grammar helps detection accuracy and performance by limiting what the recognizer listens for
    createRecognizer(currentWakeWord)

    startListening(window)

    // Handle wake word updates from renderer
    ipcMain.on('update-wake-word', (_, newWord) => {
      if (newWord && newWord !== currentWakeWord) {
        console.log(`Updating wake word to: ${newWord}`)
        currentWakeWord = newWord.toLowerCase()
        createRecognizer(currentWakeWord)
      }
    })

    // Handle stop/start requests if needed
    ipcMain.on('stop-wake-word-listening', () => {
      stopListening()
    })

    ipcMain.on('start-wake-word-listening', () => {
      startListening(window)
    })

  } catch (error) {
    console.error('Failed to initialize Vosk model:', error)
  }
}

function createRecognizer(wakeWord: string) {
  if (model) {
    // Free previous recognizer if exists
    if (rec) {
      rec.free()
    }
    // Grammar: [wakeWord, "[unkn]"]
    rec = new Recognizer({ model: model, sampleRate: 16000, grammar: [wakeWord, "[unkn]"] })
  }
}

function startListening(window: BrowserWindow) {
  if (micInstance) {
    return // Already listening
  }

  console.log('Starting wake word listener...')

  try {
    // We do NOT set 'silence' parameter, to ensure it listens indefinitely even during silence.
    // We let node-record-lpcm16 auto-detect the recording program (rec, sox, or arecord).
    micInstance = recorder.record({
      sampleRate: 16000,
      threshold: 0,
      verbose: false,
    })

    const stream = micInstance.stream()

    stream.on('data', (data: Buffer) => {
      if (rec && rec.acceptWaveform(data)) {
        const result = rec.result()
        // result.text will contain the recognized text
        if (result.text === currentWakeWord) {
          console.log('WAKE WORD DETECTED!')
          window.webContents.send('wake-word-detected')
        }
      }
    })

    stream.on('error', (err: any) => {
        console.error('Microphone stream error:', err)
    })

  } catch (e) {
    console.error('Failed to start microphone recording:', e)
  }
}

function stopListening() {
  if (micInstance) {
    micInstance.stop()
    micInstance = null
    console.log('Stopped wake word listener')
  }
}

export function cleanupWakeWord() {
  stopListening()
  if (rec) {
    rec.free()
    rec = null
  }
  if (model) {
    model.free()
    model = null
  }
}
