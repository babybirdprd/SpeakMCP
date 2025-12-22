import EventEmitter from "./event-emitter"

export class WakeWordRecorder extends EventEmitter<{
  "audio-chunk": [Float32Array]
  destroy: []
}> {
  stream: MediaStream | null = null
  audioContext: AudioContext | null = null
  processor: ScriptProcessorNode | null = null

  constructor() {
    super()
  }

  async start() {
    this.stop()

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: "default",
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      })

      this.audioContext = new AudioContext({ sampleRate: 16000 })
      const source = this.audioContext.createMediaStreamSource(this.stream)

      // Buffer size 4096 gives ~0.25s chunks at 16kHz
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1)

      this.processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0)
        // Clone the data to avoid race conditions or referencing released buffers
        const data = new Float32Array(inputData)
        this.emit("audio-chunk", data)
      }

      source.connect(this.processor)
      this.processor.connect(this.audioContext.destination)

      console.log("[WakeWordRecorder] Started")

    } catch (err) {
      console.error("[WakeWordRecorder] Failed to start:", err)
    }
  }

  stop() {
    if (this.processor) {
      this.processor.disconnect()
      this.processor = null
    }

    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
      this.stream = null
    }

    this.emit("destroy")
    console.log("[WakeWordRecorder] Stopped")
  }
}
