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
    similarityThreshold: number = 0.7
  ): WordMatchResult {
    // Extract Arabic words using regex
    const arabicWordRegex = /[\u0600-\u06FF]+/g;
    const expectedWords = expectedText.match(arabicWordRegex) || [];
    const transcribedWords = transcribedText.match(arabicWordRegex) || [];
    
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
    const perfectMatch = accuracy >= 0.9 && matchedCount >= totalWords * 0.9;
    
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
    const normalizedA = this.normalizeArabic(word1);
    const normalizedB = this.normalizeArabic(word2);
    
    // If normalized strings match exactly, return high similarity
    if (normalizedA === normalizedB) return 0.9;
    
    // Calculate Levenshtein distance and convert to similarity ratio
    const distance = this.levenshteinDistance(normalizedA, normalizedB);
    const maxLength = Math.max(normalizedA.length, normalizedB.length);
    
    // Convert distance to similarity ratio
    return maxLength > 0 ? 1 - (distance / maxLength) : 0;
  }
  
  /**
   * Calculate Levenshtein distance between two strings
   * @param a First string
   * @param b Second string
   * @returns The edit distance between the strings
   */
  levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];
    
    // Initialize matrix
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    
    for (let i = 0; i <= a.length; i++) {
      matrix[0][i] = i;
    }
    
    // Fill matrix
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i-1) === a.charAt(j-1)) {
          matrix[i][j] = matrix[i-1][j-1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i-1][j-1] + 1, // substitution
            matrix[i][j-1] + 1,   // insertion
            matrix[i-1][j] + 1    // deletion
          );
        }
      }
    }
    
    return matrix[b.length][a.length];
  }
  
  /**
   * Normalize Arabic text by removing diacritics and standardizing characters
   * @param text Arabic text to normalize
   * @returns Normalized text
   */
  normalizeArabic(text: string): string {
    return text
      // Remove diacritics (harakat)
      .replace(/[\u064B-\u065F\u0670]/g, '')
      // Normalize alif variants
      .replace(/[\u0622\u0623\u0625]/g, '\u0627')
      // Normalize ya and alif maksura
      .replace(/\u0649/g, '\u064A');
  }
}

// Create a singleton instance
export const wordMatchingService = new WordMatchingService();
