use ort::{session, session::builder::{GraphOptimizationLevel, SessionBuilder}, value::{Value, Tensor}};
use ndarray::{Array, Array2, Array3, Axis, s};
use mel_spec::mel;
use rustfft::{FftPlanner, num_complex::Complex, num_traits::Zero};
use std::sync::Arc;

// OpenWakeWord parameters (inferred from issue and standard practice)
const SAMPLE_RATE: f32 = 16000.0;
const WINDOW_SIZE: usize = 400; // 25ms
const HOP_SIZE: usize = 160;    // 10ms
const FFT_SIZE: usize = 512;    // Power of 2 >= 400
const N_MELS: usize = 32;
const EMBEDDING_SIZE: usize = 76; // Number of frames for context

pub struct WakeWordEngine {
    session: session::Session,
    // Audio buffer to hold incoming samples until we have a full window
    audio_buffer: Vec<f32>,
    // Feature buffer to hold melspectrogram frames
    feature_buffer: Vec<Vec<f32>>, // Ring buffer of frames

    // DSP state
    fft: Arc<dyn rustfft::Fft<f32>>,
    mel_filters: Array2<f32>, // (N_MELS, FFT_SIZE/2 + 1)
    window: Vec<f32>,

    // Scratch space
    fft_buffer: Vec<Complex<f32>>,
}

impl WakeWordEngine {
    pub fn new(model_path: &str) -> Result<Self, String> {
        let builder = SessionBuilder::new()
            .map_err(|e| e.to_string())?
            .with_optimization_level(GraphOptimizationLevel::Level3)
            .map_err(|e| e.to_string())?
            .with_intra_threads(1)
            .map_err(|e| e.to_string())?;

        let session = builder.commit_from_file(model_path)
            .map_err(|e| e.to_string())?;

        // Setup FFT
        let mut planner = FftPlanner::new();
        let fft = planner.plan_fft_forward(FFT_SIZE);

        // Setup Mel Filterbank
        // mel_spec returns ndarray 0.15 Array2.
        // We need to convert it to ndarray 0.16 Array2.
        let mel_filters_old = mel(SAMPLE_RATE as f64, FFT_SIZE, N_MELS, false, true);
        let shape = mel_filters_old.shape().to_vec();
        // into_raw_vec() is consistent across versions usually.
        let vec = mel_filters_old.into_raw_vec();

        let mel_filters_f64 = Array2::from_shape_vec((shape[0], shape[1]), vec)
             .map_err(|e| format!("Failed to reshape mel filters: {}", e))?;

        let mel_filters = mel_filters_f64.mapv(|x| x as f32);

        // Setup Window (Hann)
        let window: Vec<f32> = (0..WINDOW_SIZE)
            .map(|i| 0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / (WINDOW_SIZE as f32)).cos()))
            .collect();

        Ok(WakeWordEngine {
            session,
            audio_buffer: Vec::with_capacity(WINDOW_SIZE * 2),
            feature_buffer: vec![vec![0.0; N_MELS]; EMBEDDING_SIZE], // Pre-fill with zeros
            fft,
            mel_filters,
            window,
            fft_buffer: vec![Complex::zero(); FFT_SIZE],
        })
    }

    pub fn detect(&mut self, audio: &[f32]) -> Result<bool, String> {
        self.audio_buffer.extend_from_slice(audio);

        let mut detected = false;

        // Process full windows
        while self.audio_buffer.len() >= WINDOW_SIZE {
            // 1. Extract Window and Prepare FFT Input
            for (i, w) in self.window.iter().enumerate() {
                self.fft_buffer[i] = Complex::new(self.audio_buffer[i] * w, 0.0);
            }
            // Zero pad the rest
            for i in WINDOW_SIZE..FFT_SIZE {
                self.fft_buffer[i] = Complex::zero();
            }

            // 2. FFT (in-place)
            self.fft.process(&mut self.fft_buffer);

            // 3. Power Spectrum (mag^2)
            // Only need first FFT_SIZE/2 + 1
            let spec_len = FFT_SIZE / 2 + 1;
            let mut power_spec = Vec::with_capacity(spec_len);
            for i in 0..spec_len {
                power_spec.push(self.fft_buffer[i].norm_sqr());
            }
            let power_spec_arr = Array::from_vec(power_spec); // Shape (257,)

            // 4. Mel Filterbank
            // Dot product: (32, 257) x (257, 1) -> (32, 1)
            let mel_spec = self.mel_filters.dot(&power_spec_arr);

            // 5. Log Mel
            let log_mel: Vec<f32> = mel_spec.iter()
                .map(|&x| (x.max(1e-10)).log10())
                .collect();

            // 6. Update Feature Buffer
            self.feature_buffer.remove(0);
            self.feature_buffer.push(log_mel);

            // 7. Inference
            let mut flat_features = Vec::with_capacity(EMBEDDING_SIZE * N_MELS);
            for frame in &self.feature_buffer {
                flat_features.extend_from_slice(frame);
            }

            let input_array = Array::from_shape_vec((1, EMBEDDING_SIZE, N_MELS, 1), flat_features)
                .map_err(|e| e.to_string())?;

            // Convert Array to Tensor
            let input_tensor = Tensor::from_array(input_array.into_dyn())
                 .map_err(|e| e.to_string())?;

            // Run inference
            let outputs = self.session.run(ort::inputs![input_tensor])
                .map_err(|e| e.to_string())?;

            let output_tuple = outputs[0].try_extract_tensor::<f32>()
                 .map_err(|e| e.to_string())?;

            let (_, data) = output_tuple;
            let score = data.first().cloned().unwrap_or(0.0);

            if score > 0.5 {
                detected = true;
            }

            // Remove HOP_SIZE samples
            self.audio_buffer.drain(0..HOP_SIZE);
        }

        Ok(detected)
    }
}
