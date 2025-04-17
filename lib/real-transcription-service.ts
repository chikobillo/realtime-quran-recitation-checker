// Real Transcription Service using Web Speech API for Arabic

type TranscriptionCallback = (transcription: string) => void;

// Define SpeechRecognition types for TypeScript
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
  interpretation: any;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionError extends Event {
  error: string;
  message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onaudioend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onaudiostart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionError) => any) | null;
  onnomatch: ((this: SpeechRecognition, ev: Event) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onsoundend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onsoundstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onspeechend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onspeechstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
  prototype: SpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export class RealTranscriptionService {
  private isActive: boolean = false;
  private recognition: SpeechRecognition | null = null;
  private callback: TranscriptionCallback | null = null;
  private audioContext: AudioContext | null = null;
  private analyzer: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private speechDetectionInterval: NodeJS.Timeout | null = null;
  private silenceTimer: NodeJS.Timeout | null = null;
  private lastSpeechTime: number = 0;
  
  constructor() {}
  
  // Start recording and transcription
  async start(callback: TranscriptionCallback): Promise<boolean> {
    if (this.isActive) return true;
    
    try {
      // Reset state
      this.isActive = true;
      this.callback = callback;
      this.lastSpeechTime = Date.now();
      
      // Check if browser supports SpeechRecognition
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      
      if (!SpeechRecognition) {
        throw new Error('Speech recognition not supported in this browser');
      }
      
      // Create speech recognition instance
      this.recognition = new SpeechRecognition();
      
      // Configure recognition
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'ar-SA'; // Arabic language
      this.recognition.maxAlternatives = 1;
      
      // Set up event handlers
      this.recognition.onresult = (event) => {
        if (!this.isActive) return;
        
        // Get the latest result
        const result = event.results[event.results.length - 1];
        const transcript = result[0].transcript;
        
        // Notify callback directly
        if (this.callback) {
          this.callback(transcript);
        }
        
        // Update last speech time
        this.lastSpeechTime = Date.now();
      };
      
      this.recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
      };
      
      this.recognition.onend = () => {
        // Restart if still active
        if (this.isActive) {
          try {
            this.recognition?.start();
          } catch (error) {
            console.error('Error restarting recognition:', error);
          }
        }
      };
      
      // Start recognition
      this.recognition.start();
      
      // Set up audio analysis for silence detection
      await this.setupAudioAnalysis();
      
      return true;
    } catch (error) {
      console.error('Error starting real transcription service:', error);
      this.stop();
      return false;
    }
  }
  
  // Set up audio analysis for silence detection
  private async setupAudioAnalysis(): Promise<void> {
    try {
      // Get audio stream
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      // Set up audio context and analyzer
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.analyzer = this.audioContext.createAnalyser();
      this.analyzer.fftSize = 256;
      
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      source.connect(this.analyzer);
      
      // Start silence detection
      this.startSilenceDetection();
    } catch (error) {
      console.error('Error setting up audio analysis:', error);
    }
  }
  
  // Start silence detection
  private startSilenceDetection(): void {
    // Clear any existing interval
    if (this.speechDetectionInterval) {
      clearInterval(this.speechDetectionInterval);
    }
    
    // Track consecutive silence frames for more reliable detection
    let silenceFrames = 0;
    const silenceThreshold = 25; // Lower threshold to detect quieter speech
    const requiredSilenceFrames = 15; // Need 15 consecutive silent frames (4.5 seconds)
    
    // Set up interval to check for silence
    this.speechDetectionInterval = setInterval(() => {
      if (!this.isActive || !this.analyzer) return;
      
      const dataArray = new Uint8Array(this.analyzer.frequencyBinCount);
      this.analyzer.getByteFrequencyData(dataArray);
      
      // Calculate average volume
      const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
      
      // Check if there's speech
      const isSpeaking = average > silenceThreshold;
      
      if (isSpeaking) {
        // Reset silence counters if speaking
        this.lastSpeechTime = Date.now();
        silenceFrames = 0;
        
        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer);
          this.silenceTimer = null;
        }
      } else {
        // Increment silence counter
        silenceFrames++;
        
        // Check if silence has been long enough to consider stopping
        if (silenceFrames >= requiredSilenceFrames && !this.silenceTimer) {
          // Set timer to stop after continued silence
          this.silenceTimer = setTimeout(() => {
            // Double-check that we're still silent
            const currentTime = Date.now();
            const silenceDuration = currentTime - this.lastSpeechTime;
            
            if (silenceDuration > 4000) { // At least 4 seconds of silence
              this.stop();
            } else {
              // Not enough silence, reset timer
              this.silenceTimer = null;
            }
          }, 1000); // Wait another second to confirm silence
        }
      }
    }, 300); // Check every 300ms
  }
  
  // Stop recording and transcription
  stop(): void {
    this.isActive = false;
    
    // Stop speech recognition
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (error) {
        console.error('Error stopping recognition:', error);
      }
      this.recognition = null;
    }
    
    // Stop silence detection
    if (this.speechDetectionInterval) {
      clearInterval(this.speechDetectionInterval);
      this.speechDetectionInterval = null;
    }
    
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    
    // Clean up audio resources
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
      this.analyzer = null;
    }
    
    this.callback = null;
  }
}

// Create a singleton instance
export const realTranscriptionService = new RealTranscriptionService();
