// Word Matching Service for Arabic text comparison

/**
 * Result of a word matching operation
 */
export interface WordMatchResult {
  matchedWords: string[];
  unmatchedWords: string[];
  accuracy: number;
  matchedCount: number;
  totalWords: number;
  perfectMatch: boolean;
}

/**
 * Service for matching words between expected text and transcription
 */
class WordMatchingService {
  // Constants for better maintainability
  private static readonly DEFAULT_SIMILARITY_THRESHOLD = 0.7;
  private static readonly PERFECT_MATCH_THRESHOLD = 0.9;
  private static readonly ARABIC_WORD_REGEX = /[\u0600-\u06FF]+/g;
  private static readonly DIACRITICS_REGEX = /[\u064B-\u065F\u0670]/g;
  private static readonly ALIF_VARIANTS_REGEX = /[\u0622\u0623\u0625]/g;
  private static readonly YA_REGEX = /\u0649/g;
  private static readonly NORMALIZED_MATCH_SIMILARITY = 0.9;

  /**
   * Match words between expected text and transcription
   * @param expectedText The expected text (e.g., Quranic verse)
   * @param transcribedText The transcribed text from speech recognition
   * @param similarityThreshold Threshold for considering words as matching (0.0-1.0)
   * @returns Word matching result with accuracy metrics
   */
  matchWords(
    expectedText: string,
    transcribedText: string,
    similarityThreshold: number = WordMatchingService.DEFAULT_SIMILARITY_THRESHOLD
  ): WordMatchResult {
    // Validate inputs
    if (similarityThreshold < 0 || similarityThreshold > 1) {
      throw new Error('Similarity threshold must be between 0 and 1');
    }
    
    // Extract Arabic words using regex
    const expectedWords = expectedText.match(WordMatchingService.ARABIC_WORD_REGEX) || [];
    const transcribedWords = transcribedText.match(WordMatchingService.ARABIC_WORD_REGEX) || [];
    
    const matchedWords: string[] = [];
    const unmatchedWords: string[] = [...expectedWords];
    
    let matchedCount = 0;
    const totalWords = expectedWords.length;
    
    // For each transcribed word, find the best matching expected word
    for (const transcribedWord of transcribedWords) {
      let bestMatchIndex = -1;
      let bestMatchSimilarity = 0;
      
      // Find the best match among the unmatched expected words
      for (let i = 0; i < unmatchedWords.length; i++) {
        const expectedWord = unmatchedWords[i];
        const similarity = this.calculateSimilarity(expectedWord, transcribedWord);
        
        if (similarity > bestMatchSimilarity && similarity >= similarityThreshold) {
          bestMatchSimilarity = similarity;
          bestMatchIndex = i;
        }
      }
      
      // If a match was found, remove it from unmatched and add to matched
      if (bestMatchIndex !== -1) {
        const matchedWord = unmatchedWords[bestMatchIndex];
        matchedWords.push(matchedWord);
        unmatchedWords.splice(bestMatchIndex, 1);
        matchedCount++;
      }
    }
    
    // Calculate accuracy
    const accuracy = totalWords > 0 ? matchedCount / totalWords : 0;
    
    // Determine if it's a perfect match
    const perfectMatch = accuracy >= WordMatchingService.PERFECT_MATCH_THRESHOLD && 
                        matchedCount >= totalWords * WordMatchingService.PERFECT_MATCH_THRESHOLD;
    
    return {
      matchedWords,
      unmatchedWords,
      accuracy,
      matchedCount,
      totalWords,
      perfectMatch
    };
  }
  
  /**
   * Calculate similarity between two words
   * @param word1 First word to compare
   * @param word2 Second word to compare
   * @returns Similarity score between 0.0 and 1.0
   */
  calculateSimilarity(word1: string, word2: string): number {
    if (word1 === word2) return 1.0;
    if (word1.length === 0 || word2.length === 0) return 0.0;
    
    // Apply Arabic-specific normalization
    const normalizedA = WordMatchingService.normalizeArabic(word1);
    const normalizedB = WordMatchingService.normalizeArabic(word2);
    
    // If normalized strings match exactly, return high similarity
    if (normalizedA === normalizedB) return WordMatchingService.NORMALIZED_MATCH_SIMILARITY;
    
    // Calculate Levenshtein distance and convert to similarity ratio
    const distance = WordMatchingService.levenshteinDistance(normalizedA, normalizedB);
    const maxLength = Math.max(normalizedA.length, normalizedB.length);
    
    // Convert distance to similarity ratio
    return maxLength > 0 ? 1 - (distance / maxLength) : 0;
  }
  
  /**
   * Calculate Levenshtein distance between two strings with optimized memory usage
   * @param a First string
   * @param b Second string
   * @returns The edit distance between the strings
   */
  private static levenshteinDistance(a: string, b: string): number {
    // Optimize for empty strings
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    
    // Use only two rows instead of full matrix
    let prevRow = Array(a.length + 1).fill(0);
    let currRow = Array(a.length + 1).fill(0);
    
    // Initialize first row
    for (let i = 0; i <= a.length; i++) {
      prevRow[i] = i;
    }
    
    // Fill matrix
    for (let i = 1; i <= b.length; i++) {
      currRow[0] = i;
      
      for (let j = 1; j <= a.length; j++) {
        const cost = b.charAt(i-1) === a.charAt(j-1) ? 0 : 1;
        currRow[j] = Math.min(
          prevRow[j-1] + cost,  // substitution
          prevRow[j] + 1,       // deletion
          currRow[j-1] + 1      // insertion
        );
      }
      
      // Swap rows
      [prevRow, currRow] = [currRow, prevRow];
    }
    
    return prevRow[a.length];
  }
  
  /**
   * Normalize Arabic text by removing diacritics and standardizing characters
   * @param text Arabic text to normalize
   * @returns Normalized text
   */
  private static normalizeArabic(text: string): string {
    return text
      // Remove diacritics (harakat)
      .replace(WordMatchingService.DIACRITICS_REGEX, '')
      // Normalize alif variants
      .replace(WordMatchingService.ALIF_VARIANTS_REGEX, '\u0627')
      // Normalize ya and alif maksura
      .replace(WordMatchingService.YA_REGEX, '\u064A');
  }
}

// Create a singleton instance
export const wordMatchingService = new WordMatchingService();
