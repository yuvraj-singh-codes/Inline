import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { glob } from 'glob';

interface EditContext {
  originalText: string;
  newText: string;
  projectId?: string;
  elementContext: {
    elementTag: string;
    elementClasses?: string[];
    elementId?: string;
    heroPageElementId?: string;
    cssSelector: string;
    elementPath: string;
  };
  surroundingContext?: {
    parentText?: string;
    siblingsBefore?: string[];
    siblingsAfter?: string[];
    nearbyUniqueText?: string;
    [key: string]: unknown;
  };
  pageContext: {
    pageUrl: string;
    pageTitle?: string;
    fullUrl?: string;
  };
  componentContext?: {
    componentName?: string;
    propName?: string;
    componentProps?: Record<string, unknown>;
  };
}

interface FileMatch {
  filePath: string;
  lineNumber: number;
  originalLine: string;
  updatedLine: string;
  matchedText: string;
  matchedVariation?: string;
  contextBefore: string[];
  contextAfter: string[];
  isAttributeMatch?: boolean;
  isTextContentMatch?: boolean;
  isExactMatch?: boolean;
}

interface ScoredMatch extends FileMatch {
  score: number;
  confidence: number;
  reasons: string[];
}

interface ProcessResult {
  success: boolean;
  confidence: number;
  matchedFilePath?: string;
  lineNumber?: number;
  matchContext?: string;
  alternativeMatches?: FileMatch[];
  hasConflicts: boolean;
  errorMessage?: string;
}

export class TextProcessor {
  private projectRoot: string;
  private sourceDir: string;

  constructor(projectRoot?: string) {
  
    this.projectRoot = projectRoot || process.cwd();
    

    const possibleSourceDirs = [
      path.join(this.projectRoot, 'src'),
      path.join(this.projectRoot, 'app'),
      path.join(this.projectRoot, 'pages'),
      path.join(this.projectRoot, 'components'),
      this.projectRoot,
    ];


    this.sourceDir = possibleSourceDirs.find(dir => {
      try {
        const stat = fsSync.statSync(dir);
        return stat.isDirectory();
      } catch {
        return false;
      }
    }) || this.projectRoot;
  }

  private cleanSearchText(text: string): string {
    let cleaned = text.trim();
    
    const entityMap: { [key: string]: string } = {
      '&ldquo;': '"',
      '&rdquo;': '"',
      '&lsquo;': "'",
      '&rsquo;': "'",
      '&quot;': '"',
      '&#39;': "'",
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&ndash;': '-',
      '&mdash;': '-',
      '&nbsp;': ' ',
      '&hellip;': '...',
    };
    
    Object.entries(entityMap).forEach(([entity, replacement]) => {
      cleaned = cleaned.replace(new RegExp(entity, 'g'), replacement);
    });
    

    
    cleaned = cleaned.replace(/[\u00A0]/g, ' ');
    cleaned = cleaned.replace(/[\u2026]/g, '...');
   
    cleaned = cleaned.replace(/[\u201C\u201D]/g, '"'); 
    cleaned = cleaned.replace(/[\u2018\u2019]/g, "'"); 
    cleaned = cleaned.replace(/[\u201E]/g, '"');       
    cleaned = cleaned.replace(/[\u201A]/g, "'");
    
   
    cleaned = cleaned.replace(/\s+/g, ' ');
    
    while (cleaned.length > 0 && (
      cleaned.charCodeAt(0) === 8220 || 
      cleaned.charCodeAt(0) === 8221 || 
      cleaned.charCodeAt(0) === 8216 || 
      cleaned.charCodeAt(0) === 8217 || 
      cleaned.charCodeAt(0) === 34 ||   
      cleaned.charCodeAt(0) === 39 ||   
      cleaned.charCodeAt(0) === 8222 || 
      cleaned.charCodeAt(0) === 8218    
    )) {
      cleaned = cleaned.substring(1);
    }
    
    while (cleaned.length > 0 && (
      cleaned.charCodeAt(cleaned.length - 1) === 8220 || 
      cleaned.charCodeAt(cleaned.length - 1) === 8221 || 
      cleaned.charCodeAt(cleaned.length - 1) === 8216 || 
      cleaned.charCodeAt(cleaned.length - 1) === 8217 || 
      cleaned.charCodeAt(cleaned.length - 1) === 34 ||   
      cleaned.charCodeAt(cleaned.length - 1) === 39 ||   
      cleaned.charCodeAt(cleaned.length - 1) === 8222 || 
      cleaned.charCodeAt(cleaned.length - 1) === 8218    
    )) {
      cleaned = cleaned.substring(0, cleaned.length - 1);
    }
    
    cleaned = cleaned.replace(/\.$/, '');
    
    return cleaned.trim();
  }

  private extractDynamicPart(text: string): string[] {
    const variations = [text];
    
    const normalizeQuotes = (str: string): string => {
      let normalized = str;
      
      
      normalized = normalized.replace(/[\u201C\u201D]/g, '"'); 
      normalized = normalized.replace(/[\u2018\u2019]/g, "'"); 
      normalized = normalized.replace(/[\u201E]/g, '"');       
      normalized = normalized.replace(/[\u201A]/g, "'");       
      normalized = normalized.replace(/[\u00AB\u00BB]/g, '"'); 
      normalized = normalized.replace(/[\u2039\u203A]/g, "'");
     
      // Preserve exact hyphen/dash characters - do NOT convert them
      
     
      normalized = normalized.replace(/[\u00A0]/g, ' '); 
      normalized = normalized.replace(/[\u2026]/g, '...'); 
      

      normalized = normalized.replace(/\s+/g, ' ');
      
      return normalized;
    };
    
    const normalizedText = normalizeQuotes(text);
    if (normalizedText !== text) {
      variations.push(normalizedText);
    }
    
    const withoutQuotes = text.replace(/^["'„""‚''«»‹›""'']+|["'„""‚''«»‹›""'']+$/g, '').trim();
    if (withoutQuotes && withoutQuotes !== text) {
      variations.push(withoutQuotes);
      const normalizedWithoutQuotes = normalizeQuotes(withoutQuotes);
      if (normalizedWithoutQuotes !== withoutQuotes) {
        variations.push(normalizedWithoutQuotes);
      }
    }
    
    const staticPrefixes = [
      /^[❌✅🔥💡📚⭐🎯🚀💪🌟✨🎉🔔📝💰🏆🎁🔍📊🎪🎨🎵🎮🎲🎯🎪]\s*/,
      /^[✓×•→←↑↓★☆♦♠♣♥]\s*/,
      /^[0-9]+\.\s*/,
      /^[a-zA-Z]\)\s*/,
      /^[-•]\s*/,
    ];

    for (const prefix of staticPrefixes) {
      const withoutPrefix = text.replace(prefix, '').trim();
      if (withoutPrefix && withoutPrefix !== text) {
        variations.push(withoutPrefix);
        // Also add normalized version
        const normalizedWithoutPrefix = normalizeQuotes(withoutPrefix);
        if (normalizedWithoutPrefix !== withoutPrefix) {
          variations.push(normalizedWithoutPrefix);
        }
      }
    }

    const staticSuffixes = [
      /\s*[❌✅🔥💡📚⭐🎯🚀💪🌟✨🎉🔔📝💰🏆🎁🔍📊🎪🎨🎵🎮🎲🎯🎪]$/,
      /\s*[✓×•→←↑↓★☆♦♠♣♥]$/,
    ];

    for (const suffix of staticSuffixes) {
      const withoutSuffix = text.replace(suffix, '').trim();
      if (withoutSuffix && withoutSuffix !== text) {
        variations.push(withoutSuffix);
        // Also add normalized version
        const normalizedWithoutSuffix = normalizeQuotes(withoutSuffix);
        if (normalizedWithoutSuffix !== withoutSuffix) {
          variations.push(normalizedWithoutSuffix);
        }
      }
    }

    return Array.from(new Set(variations));
  }

  private isAttributeMatch(line: string, variation: string): boolean {
    const attributePatterns = [
      new RegExp(`\\w+\\s*=\\s*"[^"]*${this.escapeRegex(variation)}[^"]*"`, 'i'),
      new RegExp(`\\w+\\s*=\\s*'[^']*${this.escapeRegex(variation)}[^']*'`, 'i'),
      new RegExp(`\\w+\\s*=\\s*\\{[^}]*${this.escapeRegex(variation)}[^}]*\\}`, 'i'),
    ];
    
    return attributePatterns.some(pattern => pattern.test(line));
  }

  private isTextContentMatch(line: string, variation: string): boolean {
    
    // const trimmedLine = line.trim();
    
 
    if (!this.isAttributeMatch(line, variation)) {
      return true;
    }
    
    
    const contentAttributes = [
      'quote=', 'title=', 'alt=', 'placeholder=', 'label=', 'content=', 
      'description=', 'text=', 'value=', 'message=', 'caption='
    ];
    
    const hasContentAttribute = contentAttributes.some(attr => 
      line.toLowerCase().includes(attr.toLowerCase()) && 
      line.includes(variation)
    );
    
    if (hasContentAttribute) {
      return true;
    }
    
   
    let lineWithoutAttributes = line;
    
    lineWithoutAttributes = lineWithoutAttributes.replace(/"[^"]*"/g, '""');
    lineWithoutAttributes = lineWithoutAttributes.replace(/'[^']*'/g, "''");
    lineWithoutAttributes = lineWithoutAttributes.replace(/\{[^}]*\}/g, '{}');
    
    return lineWithoutAttributes.includes(variation);
  }

  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private hasExactTextMatch(line: string, searchText: string): boolean {
    
    
    const basicQuotedPatterns = [
      `"${searchText}"`,  
      `'${searchText}'`,   
      `\`${searchText}\``, 
      `&quot;${searchText}&quot;`, 
      `&ldquo;${searchText}&rdquo;`,  
    ];
    
    for (const pattern of basicQuotedPatterns) {
      if (line.includes(pattern)) {
        return true;
      }
    }
    
    const simplePatterns = [
      `="${searchText}"`,  
      `='${searchText}'`, 
      `: "${searchText}"`, 
      `: '${searchText}'`,  
      `quote="${searchText}"`,  
      `quote='${searchText}'`,  
      `text: '${searchText}'`, 
      `text: "${searchText}"`,  
    ];
    
    for (const pattern of simplePatterns) {
      if (line.includes(pattern)) {
        return true;
      }
    }
    
    
    const withPunctuation = [
      `"${searchText}."`,   
      `'${searchText}.'`,   
      `"${searchText}!"`,
      `'${searchText}!'`,  
      `"${searchText}?"`,   
      `'${searchText}?'`,  
      `"${searchText}.",`, 
      `'${searchText}.',`,  
      `"${searchText}",`,  
      `'${searchText}',`,   
      `quote="${searchText}."`, 
      `quote='${searchText}.'`, 
      `text: '${searchText}.',`, 
      `text: "${searchText}.",`, 
      `text: '${searchText}.'`, 
      `text: "${searchText}."`, 
      `&quot;${searchText}.&quot;`,  
      `&quot;${searchText}&quot;`,  
      `&ldquo;${searchText}!&rdquo;`, 
      `&ldquo;${searchText}.&rdquo;`, 
      `&ldquo;${searchText}&rdquo;`,  
    ];
    
    for (const pattern of withPunctuation) {
      if (line.includes(pattern)) {
        return true;
      }
    }
    
    const trimmedLine = line.trim();
    if (trimmedLine === searchText || 
        trimmedLine === `"${searchText}"` || 
        trimmedLine === `'${searchText}'`) {
      return true;
    }
    
    if (line.includes(`>${searchText}<`)) {
      return true;
    }
    
    if (trimmedLine === searchText || 
        trimmedLine === searchText + '.' || 
        trimmedLine === searchText + '!' || 
        trimmedLine === searchText + '?') {
      return true;
    }
    
    return false;
  }

  private extractOriginalTextFromLine(originalLine: string, normalizedSearchText: string, normalizedLine: string): string {
    
    const normalizedIndex = normalizedLine.indexOf(normalizedSearchText);
    if (normalizedIndex === -1) {
      return normalizedSearchText;
    }
    
  
    if (originalLine.includes('&')) {
      const textWithEntities = this.findTextWithHtmlEntities(originalLine, normalizedSearchText);
      if (textWithEntities) {
        const trimmed = textWithEntities.trim();
        if (this.cleanSearchText(trimmed) === normalizedSearchText) {
          return trimmed;
        }
        return textWithEntities;
      }
    }
  
    const quotedTextMatch = originalLine.match(/(['"`])([^'"]*)\1/);
    if (quotedTextMatch) {
      const quotedContent = quotedTextMatch[2];
      const normalizedQuotedContent = this.cleanSearchText(quotedContent);
      
      if (normalizedQuotedContent === normalizedSearchText) {
        return quotedContent;
      }
    }

    const searchLength = normalizedSearchText.length;
    
    for (let length = Math.min(originalLine.length, searchLength + 10); length >= searchLength - 5; length--) {
      for (let start = 0; start <= originalLine.length - length; start++) {
        const candidate = originalLine.substring(start, start + length);
        const normalizedCandidate = this.cleanSearchText(candidate);
        
        if (normalizedCandidate === normalizedSearchText) {
          return candidate;
        }
      }
    }
    
    return normalizedSearchText;
  }

  private findTextWithHtmlEntities(originalLine: string, normalizedSearchText: string): string | null {
    
    const normalizedLine = this.cleanSearchText(originalLine);
    const searchIndex = normalizedLine.indexOf(normalizedSearchText);
    
    if (searchIndex === -1) {
      return null;
    }
    
   
    let originalIndex = 0;
    let normalizedIndex = 0;
    const originalChars = Array.from(originalLine);
    
    while (normalizedIndex < searchIndex && originalIndex < originalChars.length) {
      const originalChar = originalChars[originalIndex];
      
      if (originalChar === '&') {
        const entityMatch = originalLine.slice(originalIndex).match(/^&[a-zA-Z0-9#]+;/);
        if (entityMatch) {
          const entity = entityMatch[0];
          const normalizedEntity = this.cleanSearchText(entity);
          originalIndex += entity.length;
          normalizedIndex += normalizedEntity.length;
          continue;
        }
      }
      
      const normalizedChar = this.cleanSearchText(originalChar);
      originalIndex++;
      normalizedIndex += normalizedChar.length;
    }
    
    // const startIndex = originalIndex;
    
    let remainingSearchLength = normalizedSearchText.length;
    const candidateStart = originalIndex;
    
    while (remainingSearchLength > 0 && originalIndex < originalChars.length) {
      const originalChar = originalChars[originalIndex];
      
      if (originalChar === '&') {
        const entityMatch = originalLine.slice(originalIndex).match(/^&[a-zA-Z0-9#]+;/);
        if (entityMatch) {
          const entity = entityMatch[0];
          const normalizedEntity = this.cleanSearchText(entity);
          originalIndex += entity.length;
          remainingSearchLength -= normalizedEntity.length;
          continue;
        }
      }
      
      const normalizedChar = this.cleanSearchText(originalChar);
      originalIndex++;
      remainingSearchLength -= normalizedChar.length;
    }
    
    const candidate = originalLine.slice(candidateStart, originalIndex);
    
    if (this.cleanSearchText(candidate) === normalizedSearchText) {
      return candidate;
    }
    
    return null;
  }

  private replaceTextContent(line: string, oldText: string, newText: string): string {
    if (line.includes(':') && (line.includes('"') || line.includes("'"))) {
      return this.replaceJsonValue(line, oldText, newText);
    }
    
    if (line.includes('&quot;')) {
      return this.preserveEntityQuotesSimple(line, oldText, newText);
    }
    
    if (line.includes('<') && line.includes('>')) {
      const textContentRegex = />([^<]*)</g;
      let result = line;
      let match;
      
      while ((match = textContentRegex.exec(line)) !== null) {
        const textContent = match[1];
        if (textContent.includes(oldText)) {
          const updatedTextContent = textContent.replace(new RegExp(this.escapeRegex(oldText), 'g'), newText);
          result = result.replace(textContent, updatedTextContent);
        }
      }

      const beforeFirstTag = line.match(/^([^<]*)</);
      if (beforeFirstTag && beforeFirstTag[1].includes(oldText)) {
        result = result.replace(beforeFirstTag[1], beforeFirstTag[1].replace(new RegExp(this.escapeRegex(oldText), 'g'), newText));
      }
      
      const afterLastTag = line.match(/>([^<]*)$/);
      if (afterLastTag && afterLastTag[1].includes(oldText)) {
        result = result.replace(afterLastTag[1], afterLastTag[1].replace(new RegExp(this.escapeRegex(oldText), 'g'), newText));
      }
      
      return result;
    } else {
      return line.replace(new RegExp(this.escapeRegex(oldText), 'g'), newText);
    }
  }

  private preserveEntityQuotesSimple(line: string, oldText: string, newText: string): string {
    
    let cleanOldText = oldText;
    if (oldText.startsWith('&quot;') && oldText.endsWith('&quot;')) {
      cleanOldText = oldText.slice(6, -6); 
    }
    
    const quotePattern = /(&quot;)([^&]*?)(&quot;)/g;
    
    return line.replace(quotePattern, (match, openQuote, content, closeQuote) => {
      if (content.includes(cleanOldText) || content === cleanOldText || match === oldText) {
        return `${openQuote}${newText}${closeQuote}`;
      }
      return match;
    });
  }


  private replaceJsonValue(line: string, oldText: string, newText: string): string {
   
    let cleanOldText = oldText.trim();
    
    if (cleanOldText.startsWith(' "') && cleanOldText.endsWith('"')) {
      cleanOldText = cleanOldText.slice(2, -1); 
    } else if (cleanOldText.startsWith('"') && cleanOldText.endsWith('"')) {
      cleanOldText = cleanOldText.slice(1, -1); 
    }
    
    const quotedStringPattern = /"([^"\\]*(\\.[^"\\]*)*)"/g;
    
    const result = line.replace(quotedStringPattern, (match, content) => {
      if (content === cleanOldText || content.includes(cleanOldText)) {
        const newContent = content.replace(new RegExp(this.escapeRegex(cleanOldText), 'g'), newText);
        return `"${newContent}"`;
      }
      return match;
    });
    
    return result;
  }

  async processTextEdit(editContext: EditContext): Promise<ProcessResult> {
    try {
 
      const allMatches = await this.findTextInSourceFiles(editContext.originalText);

      if (allMatches.length === 0) {
        return {
          success: false,
          confidence: 0,
          hasConflicts: false,
          errorMessage: `No matches found`,
        };
      }


      const pageMatches = this.filterByPageContext(allMatches, editContext.pageContext);


      const scoredMatches = await this.scoreMatchesWithContext(pageMatches, editContext);


      const bestMatch = this.findBestMatch(scoredMatches);

      if (!bestMatch || bestMatch.confidence < 0.5) {
        return {
          success: false,
          confidence: bestMatch?.confidence || 0,
          hasConflicts: scoredMatches.length > 1,
          alternativeMatches: scoredMatches,
          errorMessage: bestMatch 
            ? `Low confidence match`
            : 'No matches found',
        };
      }

    
      const updateResult = await this.updateSourceFile(bestMatch, editContext);

      if (updateResult.success) {
        return {
          success: true,
          confidence: bestMatch.confidence,
          matchedFilePath: bestMatch.filePath,
          lineNumber: bestMatch.lineNumber,
          matchContext: bestMatch.originalLine,
          hasConflicts: false,
        };
      } else {
        return {
          success: false,
          confidence: bestMatch.confidence,
          hasConflicts: false,
          errorMessage: updateResult.errorMessage || 'Failed to update file',
        };
      }

    } catch (error) {
      console.error('Error in processTextEdit:', error);
      return {
        success: false,
        confidence: 0,
        hasConflicts: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  private async findTextInSourceFiles(originalText: string): Promise<FileMatch[]> {
    const cleanedText = this.cleanSearchText(originalText);
    const searchVariations = this.extractDynamicPart(cleanedText);
    
    if (originalText.includes('Häufig gestellte Fragen')) {
      console.log('[TEMP DEBUG] FAQ text processing:');
      console.log('[TEMP DEBUG] Original:', JSON.stringify(originalText));
      console.log('[TEMP DEBUG] Cleaned:', JSON.stringify(cleanedText));
      console.log('[TEMP DEBUG] Variations:', searchVariations);
    }
    
    
    
    const patterns = [
      '**/*.{ts,tsx,js,jsx}',
      '**/*.{vue,svelte}',
      '**/*.{html,htm}',
      '**/*.md',
      '**/*.mdx',
      '**/*.json',
      '**/*.faq.json',
    ];

    const allFiles: string[] = [];
    const searchDirs = [this.sourceDir];
    if (this.sourceDir !== this.projectRoot) {
      searchDirs.push(this.projectRoot);
    }

    for (const searchDir of searchDirs) {
    for (const pattern of patterns) {
      try {
        const files = await glob(pattern, { 
            cwd: searchDir,
          ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**']
        });
          allFiles.push(...files.map(f => path.join(searchDir, f)));
      } catch (error) {
          console.warn(`Failed to glob pattern ${pattern} in ${searchDir}:`, error);
      }
      }
    }

    const matches: FileMatch[] = [];

    for (const filePath of allFiles) {
      try {
        if (filePath.includes('FaqSection.tsx')) {
          console.log('[TEMP DEBUG] Searching FaqSection.tsx:', filePath);
        }
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          
          for (const variation of searchVariations) {
            const hasExactMatch = this.hasExactTextMatch(line, variation);
            const normalizedLine = this.cleanSearchText(line);
            const hasSubstringMatch = normalizedLine.includes(variation);
            
            const shouldUseMatch = hasExactMatch;
            
            if (originalText.includes('Häufig gestellte Fragen') && filePath.includes('FaqSection.tsx') && line.includes('Häufig')) {
              console.log('[TEMP DEBUG] Found FAQ line in FaqSection.tsx');
              console.log('[TEMP DEBUG] Line:', JSON.stringify(line));
              console.log('[TEMP DEBUG] Variation:', JSON.stringify(variation));
              console.log('[TEMP DEBUG] Has exact match:', hasExactMatch);
              console.log('[TEMP DEBUG] Has substring match:', hasSubstringMatch);
            }
            
            if (shouldUseMatch) {
            
              const isAttributeMatch = this.isAttributeMatch(normalizedLine, variation);
              const isTextContentMatch = this.isTextContentMatch(normalizedLine, variation);
              
              const originalTextInFile = this.extractOriginalTextFromLine(line, variation, normalizedLine);
              
              matches.push({
                filePath: path.relative(this.projectRoot, filePath),
                lineNumber: i + 1,
                originalLine: line,
                updatedLine: line.replace(originalTextInFile, searchVariations[0]),
                matchedText: originalTextInFile, 
                matchedVariation: variation !== cleanedText ? variation : undefined,
                contextBefore: lines.slice(Math.max(0, i - 3), i),
                contextAfter: lines.slice(i + 1, Math.min(lines.length, i + 4)),
                isAttributeMatch,
                isTextContentMatch,
                isExactMatch: hasExactMatch,
              });
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to read file ${filePath}:`, error);
      }
    }

    if (originalText.includes('Häufig gestellte Fragen')) {
      console.log('[TEMP DEBUG] Raw matches found:', matches.length);
      matches.forEach((match, i) => {
        console.log(`[TEMP DEBUG] Match ${i}: ${match.filePath}:${match.lineNumber}`);
      });
    }

    return matches;
  }

  private filterByPageContext(matches: FileMatch[], pageContext: { pageUrl: string }): FileMatch[] {
    if (!pageContext.pageUrl) return matches;

    const urlParts = pageContext.pageUrl.split('/').filter(Boolean);
    const lastPart = urlParts[urlParts.length - 1] || 'index';
    
 
    const scoredMatches = matches.map(match => {
      let relevanceScore = 0;
      const filePath = match.filePath.toLowerCase();

   
      if (filePath.includes(`${lastPart}/page.`)) {
        relevanceScore += 100;
      }

 
      if (urlParts.some(part => filePath.includes(part.toLowerCase()))) {
        relevanceScore += 50;
      }

  
      if (filePath.includes('/page.') || filePath.includes('page/')) {
        relevanceScore += 30;
      }

 
      if (filePath.includes('/components/')) {
        relevanceScore += 20;
      }

  
      if (filePath.includes('/layout.')) {
        relevanceScore += 10;
      }

    
      if (filePath.includes('nav') || filePath.includes('header') || filePath.includes('footer')) {
        relevanceScore += 5;
      }

      return { ...match, relevanceScore };
    });

    return scoredMatches
      .sort((a, b) => (b as { relevanceScore: number }).relevanceScore - (a as { relevanceScore: number }).relevanceScore)
      .slice(0, 10); 
  }

  private async scoreMatchesWithContext(matches: FileMatch[], context: EditContext): Promise<ScoredMatch[]> {
    const validMatches: ScoredMatch[] = [];

    const isUniqueText = matches.length === 1;

    for (const match of matches) {
      const validation = await this.validateExactContext(match, context, isUniqueText);
      
 
      if (context.originalText.includes('Häufig gestellte Fragen')) {
        console.log(`[TEMP DEBUG] Validation for ${match.filePath}: valid=${validation.isValid}, reason=${validation.reason}`);
      }
      
      if (!validation.isValid) {
        continue; 
      }

      let score = 3.0; 
      const reasons: string[] = ['Text match found', 'Context validation passed'];
      
      if (context.elementContext.elementId || context.elementContext.elementTag) {
        if (match.filePath.endsWith('.tsx') || match.filePath.endsWith('.jsx')) {
          score += 2.0; 
          reasons.push('Component file with DOM context (high priority)');
        } else if (match.filePath.includes('.map.json') || match.filePath.includes('hero-page-element-id')) {
          score -= 1.0;
          reasons.push('Mapping file (lower priority when DOM context available)');
        }
      }

      if (match.filePath.includes('/components/') || match.filePath.includes('\\components\\')) {
          score += 1.0;
        reasons.push('Component file');
      }

      if (match.isExactMatch) {
        score += 3.0;
        reasons.push('Exact text match (high priority)');
      } else {
        score -= 1.0;
        reasons.push('Non-exact match (penalty applied)');
      }
      
      if (match.isTextContentMatch && !match.isAttributeMatch) {
          score += 1.0;
        reasons.push('Text content match');
      }

      const confidence = Math.min(score / 4.0, 1.0);

      validMatches.push({
        ...match,
        score,
        confidence,
        reasons,
      });
    }


    return validMatches.sort((a, b) => b.confidence - a.confidence);
  }

  private async validateExactContext(match: FileMatch, context: EditContext, isUniqueText: boolean = false): Promise<{isValid: boolean, reason: string}> {
        const fileContent = await this.getFileContent(match.filePath);
    let validationScore = 0;
    const validationReasons: string[] = [];
    
  
    if (context.surroundingContext?.parentText) {
      const parentTextNormalized = this.cleanSearchText(context.surroundingContext.parentText);
      const originalTextNormalized = this.cleanSearchText(context.originalText);
      
      if (!parentTextNormalized.includes(originalTextNormalized)) {
        return {
          isValid: false,
          reason: 'Text not found in parent context - likely wrong element'
        };
      }
      
      const normalizedFileContent = this.cleanSearchText(fileContent);
      if (!normalizedFileContent.includes(originalTextNormalized)) {
        return {
          isValid: false,
          reason: 'Text not found in file content'
        };
      }
      
      if (parentTextNormalized.trim() === originalTextNormalized.trim()) {
        validationScore += 1; 
        validationReasons.push('Text found but with minimal parent context');
      } else {
        validationScore += 2;
        validationReasons.push('Text found in parent context and file');
      }
    }

   
    let siblingMatches = 0;
    let totalSiblings = 0;
    if (context.surroundingContext?.siblingsAfter && context.surroundingContext.siblingsAfter.length > 0) {
      for (const sibling of context.surroundingContext.siblingsAfter) {
        if (sibling.includes(':')) {
          const textPart = sibling.split(':')[1]?.split('[')[0]?.trim();
          if (textPart && textPart.length > 15) { 
            totalSiblings++;
            const normalizedTextPart = this.cleanSearchText(textPart);
            const normalizedFileContent = this.cleanSearchText(fileContent);
            if (normalizedFileContent.includes(normalizedTextPart)) {
              siblingMatches++;
            }
          }
        }
      }
    }

   
    if (totalSiblings > 0) {
      const siblingMatchRatio = siblingMatches / totalSiblings;
      if (siblingMatchRatio >= 0.5) { 
        validationScore += siblingMatches * 2; 
        validationReasons.push(`${siblingMatches}/${totalSiblings} sibling content matches found`);
      } else {
       
        validationScore -= 1;
        validationReasons.push(`Poor sibling matching: ${siblingMatches}/${totalSiblings}`);
      }
    }

    
    if (context.pageContext?.pageUrl) {
      const pageUrl = context.pageContext.pageUrl;
      const fileName = match.filePath.toLowerCase();
      
      if (pageUrl === '/' || pageUrl === '') {
        if (fileName.includes('testimonials') || fileName.includes('obstacles') || 
            fileName.includes('bausteine') || fileName.includes('hero') ||
            !fileName.includes('(light-bg)')) {
          validationScore += 1;
          validationReasons.push('File path matches home page context');
        }
      }
      
      if (pageUrl.includes('/') && pageUrl !== '/') {
        const pagePath = pageUrl.replace(/^\//, '').replace(/\/$/, '');
        if (fileName.includes(pagePath)) {
          validationScore += 2;
          validationReasons.push('File path matches page-specific context');
        }
      }
    }

    
    if (context.elementContext?.cssSelector) {
      const selector = context.elementContext.cssSelector;
      const selectorParts = selector.match(/#[\w-]+|\.[\w-]+/g) || [];
      let selectorMatches = 0;
      
      for (const part of selectorParts) {
        const cleanPart = part.substring(1); 
        if (cleanPart.length > 3 && fileContent.includes(cleanPart)) {
          selectorMatches++;
        }
      }
      
      if (selectorMatches > 0) {
        validationScore += selectorMatches * 0.5;
        validationReasons.push(`${selectorMatches} CSS selector parts matched`);
      }
    }

    const hasMinimalContext = context.surroundingContext?.parentText && 
                               this.cleanSearchText(context.surroundingContext.parentText).trim() === 
                               this.cleanSearchText(context.originalText).trim();
    
    if (hasMinimalContext) {
      const cssSelector = context.elementContext?.cssSelector || '';
      if (cssSelector.length > 20) { 
        validationScore += 1;
        validationReasons.push('Detailed CSS selector provides context for minimal parent text');
      } else {
        validationScore -= 1;
        validationReasons.push('Minimal context with limited CSS specificity (penalty applied)');
      }
    }

    if (isUniqueText) {
      validationScore += 3;
      validationReasons.push('Text is unique in codebase (high confidence)');
    }

    const hasElementId = !!context.elementContext.elementId;
    const hasStrongElementContext = hasElementId || 
                                   (context.elementContext.elementClasses?.length || 0) >= 3;
    
    if (hasElementId) {
      validationScore += 2;
      validationReasons.push('Element has unique ID (high confidence)');
    }
    
    const minRequiredScore = (hasElementId || isUniqueText) ? 1 : 
                           (hasStrongElementContext ? 1 : 
                           (hasMinimalContext ? 3 : 
                           (context.originalText.trim().length < 10 ? 2 : 1)));
    
    if (validationScore >= minRequiredScore) {
      return {
        isValid: true, 
        reason: `Passed validation (score: ${validationScore}/${minRequiredScore}): ${validationReasons.join(', ')}`
      };
    } else {
      return {
        isValid: false,
        reason: `Insufficient validation score (${validationScore}/${minRequiredScore}): ${validationReasons.join(', ') || 'no matches found'}`
      };
    }
  }

  private findBestMatch(scoredMatches: ScoredMatch[]): ScoredMatch | null {
    if (scoredMatches.length === 0) return null;

 
    const textContentMatches = scoredMatches.filter(m => m.isTextContentMatch && !m.isAttributeMatch);
    if (textContentMatches.length > 0) {
      return textContentMatches[0];
    }

    
    
    const contentAttributeMatches = scoredMatches.filter(m => {
      if (!m.isTextContentMatch || !m.isAttributeMatch) return false;
      const line = m.originalLine;
      const contentAttributes = [
        'quote=', 'title=', 'alt=', 'placeholder=', 'label=', 'content=', 
        'description=', 'text=', 'value=', 'message=', 'caption='
      ];
      return contentAttributes.some(attr => line.toLowerCase().includes(attr.toLowerCase()));
    });
    
    if (contentAttributeMatches.length > 0) {
      return contentAttributeMatches[0];
    }
    
    const mixedMatches = scoredMatches.filter(m => m.isTextContentMatch && m.isAttributeMatch);
    if (mixedMatches.length > 0) {
      return mixedMatches[0];
    }


    const bestMatch = scoredMatches[0];
    
    const highConfidenceMatches = scoredMatches.filter(m => m.confidence > 0.5);
    
    if (highConfidenceMatches.length > 1) {
      return highConfidenceMatches[0];
    }

    return bestMatch;
  }

  private async updateSourceFile(match: FileMatch, context: EditContext): Promise<{ success: boolean; errorMessage?: string }> {
    try {
      const fullPath = path.isAbsolute(match.filePath) 
        ? match.filePath 
        : path.join(this.projectRoot, match.filePath);
        
        
      const content = await fs.readFile(fullPath, 'utf-8');
      const lines = content.split('\n');
      
   
      if (match.lineNumber <= lines.length) {
        const originalLine = lines[match.lineNumber - 1];
        let updatedLine;
        updatedLine = this.replaceTextContent(originalLine, match.matchedText, context.newText);
        
        if (updatedLine === originalLine) {
          updatedLine = originalLine.replace(match.matchedText, context.newText);
        }
        
        lines[match.lineNumber - 1] = updatedLine;
        
        const updatedContent = lines.join('\n');
        await fs.writeFile(fullPath, updatedContent, 'utf-8');
        
        return { success: true };
      } else {
        return { 
          success: false, 
          errorMessage: `Line number ${match.lineNumber} exceeds file length` 
        };
      }
    } catch (error) {
      return { 
        success: false, 
        errorMessage: error instanceof Error ? error.message : 'Unknown file update error' 
      };
    }
  }

  private async getFileContent(filePath: string): Promise<string> {
    try {
      const fullPath = path.isAbsolute(filePath) 
        ? filePath 
        : path.join(this.projectRoot, filePath);
      return await fs.readFile(fullPath, 'utf-8');
    } catch (error) {
      console.warn(`Failed to read file ${filePath}:`, error);
      return '';
    }
  }


  async getProjectInfo(): Promise<{
    projectRoot: string;
    sourceDir: string;
    fileCount: number;
    supportedExtensions: string[];
  }> {
    const patterns = ['**/*.{ts,tsx,js,jsx,vue,svelte,html,md,mdx,json,faq.json}'];
    let fileCount = 0;
    
    const searchDirs = [this.sourceDir];
    if (this.sourceDir !== this.projectRoot) {
      searchDirs.push(this.projectRoot);
    }

    for (const searchDir of searchDirs) {
    for (const pattern of patterns) {
      try {
        const files = await glob(pattern, { 
            cwd: searchDir,
          ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**']
        });
        fileCount += files.length;
      } catch (error) {
          console.warn(`Failed to count files for pattern ${pattern} in ${searchDir}:`, error);
        }
      }
    }

    return {
      projectRoot: this.projectRoot,
      sourceDir: this.sourceDir,
      fileCount,
      supportedExtensions: ['ts', 'tsx', 'js', 'jsx', 'vue', 'svelte', 'html', 'md', 'mdx'],
    };
  }
}

export type { EditContext, FileMatch, ScoredMatch, ProcessResult };

