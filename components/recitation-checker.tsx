'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { realTranscriptionService } from '@/lib/real-transcription-service';
import { wordMatchingService } from '@/lib/word-matching-service';

// Schema for verse selection form
const verseSelectionSchema = z.object({
  surah: z.string().min(1, 'Please select a Surah'),
  startVerse: z.string().min(1, 'Please select a starting verse'),
  endVerse: z.string().min(1, 'Please select an ending verse'),
});

// Number of verses in each Surah
const versesPerSurah = [7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6];

type MatchResult = {
  expectedWord: string;
  bestMatch: string;
  ratio: number;
  matched: boolean;
};

// Additional styles for Arabic text containers
const arabicContainerStyle = {
  padding: "1rem",
  backgroundColor: "var(--slate-50, #f8fafc)",
  borderRadius: "0.375rem",
  border: "1px solid var(--border)"
};

interface AyahResponse {
  text: string;
  [key: string]: unknown;
}

export function RecitationChecker() {
  const [verses, setVerses] = useState<string[]>([]);
  const [selectedVerse, setSelectedVerse] = useState<string>('');
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [matchResults, setMatchResults] = useState<MatchResult[]>([]);
  const [accuracy, setAccuracy] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [processingChunk] = useState(false); // Removed unused setter
  const [isPerfectMatch, setIsPerfectMatch] = useState(false);

  
  // Refs for audio handling
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Form for verse selection
  const form = useForm<z.infer<typeof verseSelectionSchema>>({
    resolver: zodResolver(verseSelectionSchema),
    defaultValues: {
      surah: '',
      startVerse: '',
      endVerse: '',
    },
  });

  // Generate options for Surah selection
  const surahOptions = Array.from({ length: 114 }, (_, i) => ({
    value: (i + 1).toString(),
    label: `Surah ${i + 1}`,
  }));

  // Generate verse options based on selected Surah
  const getVerseOptions = (surahNumber: number) => {
    if (surahNumber < 1 || surahNumber > 114) return [];
    
    const verseCount = versesPerSurah[surahNumber - 1];
    return Array.from({ length: verseCount }, (_, i) => ({
      value: (i + 1).toString(),
      label: `Verse ${i + 1}`,
    }));
  };
  
  // Select a random verse from the Quran
  const selectRandomVerse = async () => {
    setIsLoading(true);
    try {
      // Generate a random surah number (1-114)
      const randomSurahNumber = Math.floor(Math.random() * 114) + 1;
      
      // Get the number of verses in this surah
      const verseCount = versesPerSurah[randomSurahNumber - 1];
      
      // Generate a random verse number
      const randomVerseNumber = Math.floor(Math.random() * verseCount) + 1;
      
      // Update the form values
      form.setValue('surah', randomSurahNumber.toString());
      form.setValue('startVerse', randomVerseNumber.toString());
      form.setValue('endVerse', randomVerseNumber.toString());
      
      // Fetch the random verse
      const fetchedVerses = await fetchVerses(randomSurahNumber, randomVerseNumber, randomVerseNumber);
      setVerses(fetchedVerses);
      
      if (fetchedVerses.length > 0) {
        setSelectedVerse(fetchedVerses[0]);
        toast.success(`Random verse selected: Surah ${randomSurahNumber}, Verse ${randomVerseNumber}`);
      } else {
        toast.error('Failed to load random verse. Please try again.');
      }
    } catch (error) {
      console.error('Error fetching random verse:', error);
      toast.error('Failed to load random verse. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle form submission
  const onSubmit = async (values: z.infer<typeof verseSelectionSchema>) => {
    setIsLoading(true);
    try {
      const surahNumber = parseInt(values.surah);
      const startVerse = parseInt(values.startVerse);
      const endVerse = parseInt(values.endVerse);
      
      // Fetch verses from API
      const fetchedVerses = await fetchVerses(surahNumber, startVerse, endVerse);
      setVerses(fetchedVerses);
      
      if (fetchedVerses.length > 0) {
        setSelectedVerse(fetchedVerses[0]);
        toast.success(`Successfully loaded ${fetchedVerses.length} verses`);
      } else {
        toast.error('Failed to load verses. Please try again.');
      }
    } catch (error) {
      console.error('Error fetching verses:', error);
      toast.error('Error fetching verses. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch verses from API
  const fetchVerses = async (surah: number, startVerse: number, endVerse: number): Promise<string[]> => {
    try {
      // Use our local API proxy to fetch verses
      console.log(`Fetching Surah ${surah}, verses ${startVerse}-${endVerse}...`);
      
      // Construct API URL with appropriate parameters
      const apiUrl = `/api/quran?surah=${surah}&startVerse=${startVerse}&endVerse=${endVerse}`;
      console.log(`Calling API: ${apiUrl}`);
      
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Log the full API response for debugging
      console.log('API Response:', data);
      
      if (data.code === 200 && data.data) {
        // Extract all verses from the API response
        const allVerses = data.data.ayahs;
        
        // Map the verses to their text content
        const verses = allVerses.map((v: AyahResponse) => {
          return v.text;
        });
        
        // Log the retrieved verses for debugging
        console.log(`Successfully retrieved ${verses.length} verses from API`);
        console.log('Verses content:', verses);
        return verses;
      }
      
      // Fallback for Al-Fatiha if API fails
      if (surah === 1) {
        console.log("Using hardcoded Al-Fatiha as fallback...");
        return [
          "بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ",
          "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ",
          "الرَّحْمَنِ الرَّحِيمِ",
          "مَالِكِ يَوْمِ الدِّينِ",
          "إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ",
          "اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ",
          "صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ الْمَغْضُوبِ عَلَيْهِمْ وَلَا الضَّالِّينَ"
        ].slice(startVerse - 1, endVerse);
      }
      
      // Generic fallback with error message
      console.error("Failed to fetch verses from API");
      return [`Could not load Surah ${surah}, Verse ${startVerse}. Please check your internet connection.`];
    } catch (error) {
      console.error('Error fetching verses:', error);
      return [];
    }
  };

  // Handle transcription updates from service
  const handleTranscriptionUpdate = useCallback((newTranscription: string) => {
    if (!selectedVerse) return;
    
    // Update the UI with the new transcription
    setTranscription(newTranscription);
    
    // Match the transcription with the expected verse
    const results = matchWords(selectedVerse, newTranscription);
    setMatchResults(results.matchResults);
    setAccuracy(results.accuracy);
    
    // Check if we've recited a significant portion of the verse
    // This helps determine if we should consider stopping
    const expectedWords = selectedVerse.match(/[\u0600-\u06FF]+/g) || [];
    const transcribedWords = newTranscription.match(/[\u0600-\u06FF]+/g) || [];
    
    // Calculate what percentage of the verse has been attempted
    const verseProgress = Math.min(1, transcribedWords.length / expectedWords.length);
    
    // Check if all words have good accuracy
    const allWordsAboveThreshold = 
      results.matchResults.length > 0 && 
      results.matchResults.every(r => r.ratio >= 0.45) &&
      newTranscription.length > 10 &&
      verseProgress >= 0.9; // At least 90% of the verse has been attempted
    
    // Check if we have a perfect match (all words matched correctly)
    const allMatched = 
      results.matchResults.every(r => r.matched) && 
      results.matchResults.length > 0 && 
      newTranscription.length > 10 &&
      verseProgress >= 0.9; // At least 90% of the verse has been attempted
    
    // Only stop if we've detected a significant portion of the verse
    if (allMatched) {
      setIsPerfectMatch(true);
      toast.success('Perfect recitation detected! 🎉');
      stopRecording();
    } else if (allWordsAboveThreshold) {
      toast.success('Good recitation detected!');
      stopRecording();
    }
  }, [selectedVerse]);

  // Start recording with real-time processing
  const startRecording = async () => {
    try {
      // Reset states
      setTranscription('');
      setMatchResults([]);
      setAccuracy(0);
      setAudioUrl(null);
      setIsPerfectMatch(false);
      audioChunksRef.current = [];
      
      // Use the real transcription service
      if (selectedVerse) {
        const started = await realTranscriptionService.start(handleTranscriptionUpdate);
        if (!started) {
          throw new Error('Failed to start transcription service');
        }
        setIsRecording(true);
      }
      
      toast.success('Recording started');
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('Failed to start recording. Please check microphone permissions.');
    }
  };
  
  // Clean up on unmount
  useEffect(() => {
    // Store the ref in a variable for cleanup
    const currentAudioContext = audioContextRef.current;
    
    return () => {
      // Stop transcription service when component unmounts
      realTranscriptionService.stop();
      
      // Clean up any audio resources
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      
      // Use the captured variable instead of accessing the ref directly
      if (currentAudioContext && currentAudioContext.state !== 'closed') {
        currentAudioContext.close();
      }
    };
  }, []);

  // Stop recording and clean up
  const stopRecording = () => {
    // Force stop all recording processes regardless of state
    setIsRecording(false);
    
    // Stop the transcription service
    realTranscriptionService.stop();
      
    // Close the audio tracks to release the microphone
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(track => {
          if (track.readyState === 'live') {
            track.stop();
          }
        });
        streamRef.current = null;
      } catch (error) {
        console.error('Error stopping audio tracks:', error);
      }
    }
      
    // Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch (error) {
        console.error('Error closing audio context:', error);
      }
    }
    
    toast.success('Recording stopped');
  };


  


  // Match words between expected verse and transcription
  const matchWords = (expectedVerse: string, transcription: string) => {
    // Extract Arabic words using regex
    const arabicWordRegex = /[\u0600-\u06FF]+/g;
    const expectedWords = expectedVerse.match(arabicWordRegex) || [];
    const transcribedWords = transcription.match(arabicWordRegex) || [];
    
    // Use the word matching service but don't destructure values we don't use
    wordMatchingService.matchWords(expectedVerse, transcription, 0.6);
    
    // Convert to the format expected by the component
    const results: MatchResult[] = [];
    
    // For each expected word, find its best match in the transcribed words
    let matchedCount = 0;
    for (let i = 0; i < expectedWords.length; i++) {
      const expectedWord = expectedWords[i];
      let bestMatch = 'not found';
      let bestRatio = 0;
      
      // Try to find the best match for this word
      for (const transcribedWord of transcribedWords) {
        const ratio = wordMatchingService.calculateSimilarity(expectedWord, transcribedWord);
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestMatch = transcribedWord;
        }
      }
      
      // Check if the match is good enough (threshold: 0.6)
      const matched = bestRatio >= 0.6;
      if (matched) {
        matchedCount++;
      }
      
      results.push({
        expectedWord,
        bestMatch: bestRatio > 0 ? bestMatch : 'not found',
        ratio: bestRatio,
        matched
      });
    }
    
    // Calculate the accuracy based on our own matching results
    const totalWords = expectedWords.length;
    const calculatedAccuracy = totalWords > 0 ? matchedCount / totalWords : 0;
    
    return { matchResults: results, accuracy: calculatedAccuracy };
  };

  // The similarity calculation has been moved to the word-matching-service

  // Watch for changes in the selected Surah to update verse options
  const surahValue = form.watch('surah');
  
  useEffect(() => {
    if (surahValue) {
      const surahNumber = parseInt(surahValue);
      const verseCount = versesPerSurah[surahNumber - 1];
      
      // Reset verse selections when Surah changes
      form.setValue('startVerse', '1');
      form.setValue('endVerse', Math.min(3, verseCount).toString()); // Default to first 3 verses or less
    }
  }, [surahValue, form]); // Include form in dependencies

  return (
    <div className="space-y-8">
      {/* Verse Selection Form */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle>Select Verses</CardTitle>
            <CardDescription>Choose the Surah and verses you want to recite</CardDescription>
          </div>
          <Button 
            type="button" 
            onClick={selectRandomVerse} 
            disabled={isLoading}
            variant="outline"
            size="sm"
          >
            Pick Random Verse
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="surah"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Surah</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        disabled={isLoading}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select Surah" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {surahOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="startVerse"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Verse</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        disabled={!form.watch('surah') || isLoading}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select Verse" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {form.watch('surah') && 
                            getVerseOptions(parseInt(form.watch('surah'))).map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))
                          }
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="endVerse"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End Verse</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        disabled={!form.watch('surah') || isLoading}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select Verse" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {form.watch('surah') && 
                            getVerseOptions(parseInt(form.watch('surah')))
                              .filter(option => parseInt(option.value) >= parseInt(form.watch('startVerse') || '1'))
                              .map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))
                          }
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex gap-2 w-full">
                <Button type="submit" disabled={isLoading} className="flex-1">
                  {isLoading ? 'Loading...' : 'Load Verses'}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Verse Display and Recording */}
      {verses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recitation Practice</CardTitle>
            <CardDescription>Record your recitation and get feedback</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Verse selector */}
            {verses.length > 1 && (
              <div>
                <Label htmlFor="verse-select">Select Verse to Recite</Label>
                <Select
                  onValueChange={(value) => setSelectedVerse(verses[parseInt(value)])}
                  defaultValue="0"
                >
                  <SelectTrigger id="verse-select">
                    <SelectValue placeholder="Select Verse" />
                  </SelectTrigger>
                  <SelectContent>
                    {verses.map((verse, index) => (
                      <SelectItem key={index} value={index.toString()}>
                        Verse {parseInt(form.watch('startVerse')) + index}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Expected verse */}
            <div>
              <h3 className="text-lg font-medium mb-2">Expected Verse:</h3>
              <p style={arabicContainerStyle} className="font-arabic">
                {selectedVerse}
              </p>

            </div>

            {/* Recording controls */}
            <div className="flex flex-col gap-4">

              
              <div className="flex gap-4">
                <Button 
                  onClick={startRecording} 
                  disabled={isRecording || !selectedVerse}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  Start Recording
                </Button>
                <Button 
                  onClick={stopRecording} 
                  disabled={!isRecording}
                  variant="destructive"
                >
                  Stop Recording
                </Button>
              </div>
            </div>
            
            {/* Real-time status indicator */}
            {isRecording && (
              <div className="flex items-center gap-2 mt-2">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  {processingChunk ? 'Processing audio...' : 'Recording... Speak now!'}
                </span>
              </div>
            )}

            {/* Transcription */}
            <div>
              <h3 className="text-lg font-medium mb-2">Your Recitation:</h3>
              <div className="relative">
                <p style={{...arabicContainerStyle, minHeight: "100px", transition: "all 0.2s"}} className="font-arabic">
                  {transcription || (isRecording ? '...' : '')}
                </p>
                {isRecording && processingChunk && (
                  <div className="absolute bottom-2 right-4">
                    <div className="flex gap-1">
                      <span className="animate-bounce delay-0">.</span>
                      <span className="animate-bounce delay-100">.</span>
                      <span className="animate-bounce delay-200">.</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Audio playback */}
            {audioUrl && (
              <div>
                <h3 className="text-lg font-medium mb-2">Recording:</h3>
                <audio controls src={audioUrl} className="w-full" />
              </div>
            )}

            {/* Word matching results */}
            {matchResults.length > 0 && (
              <div>
                <h3 className="text-lg font-medium mb-2">Word-by-word Matching:</h3>
                <div className="space-y-2">
                  {matchResults.map((result, index) => (
                    <div 
                      key={index} 
                      className={`p-3 rounded-md flex justify-between items-center ${
                        result.matched 
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900' 
                          : 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={result.matched ? 'text-emerald-600' : 'text-red-600'}>
                          {result.matched ? '✓' : '✗'}
                        </span>
                        <span className="font-arabic text-lg">{result.expectedWord}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-sm text-slate-500">
                          Similarity: {(result.ratio * 100).toFixed(0)}%
                        </span>
                        <span className="font-arabic">{result.bestMatch}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Accuracy */}
            {matchResults.length > 0 && (
              <div>
                <h3 className="text-lg font-medium mb-2">Overall Accuracy:</h3>
                <Progress value={accuracy * 100} className="h-3" />
                <p className="mt-2 text-center">
                  {(accuracy * 100).toFixed(1)}% ({matchResults.filter(r => r.matched).length}/{matchResults.length} words matched)
                </p>
                
                {/* Feedback message */}
                <Alert className="mt-4">
                  <AlertTitle>Feedback</AlertTitle>
                  <AlertDescription>
                    {accuracy >= 0.9 
                      ? 'Excellent! Your recitation is very accurate.' 
                      : accuracy >= 0.7 
                        ? 'Good job! Keep practicing to improve further.' 
                        : accuracy >= 0.5 
                          ? 'Not bad, but there\'s room for improvement.' 
                          : 'Needs improvement. Try again and focus on pronunciation.'}
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {/* Perfect match status */}
            {isPerfectMatch && (
              <Alert className="mt-4 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                <AlertTitle>Perfect Match! 🎉</AlertTitle>
                <AlertDescription>
                  Congratulations! Your recitation perfectly matches the expected verse.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
