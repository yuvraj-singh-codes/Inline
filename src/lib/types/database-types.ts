export interface ElementContext {
  elementTag: string;
  elementClasses?: string[];
  elementId?: string;
  heroPageElementId?: string | null;
  cssSelector?: string;
  elementPath?: string;
}

export interface SurroundingContext {
  parentText?: string;
  siblingsBefore?: string[];
  siblingsAfter?: string[];
  nearbyUniqueText?: string;
  ancestorContext?: Array<{
    tag: string;
    classes?: string[];
    id?: string;
    textContent?: string;
    attributeData?: Record<string, unknown> | null;
  }>;
  elementTextIndex?: number;
  precedingTextNodes?: string[];
  followingTextNodes?: string[];
  uniqueIdentifiers?: string[];
  detailedPath?: Array<{
    tag: string;
    classes?: string[];
    id?: string;
    position?: number;
    textSnippet?: string;
  }>;
}

export interface PageContext {
  pageUrl: string;
  pageTitle?: string;
  fullUrl?: string;
}

export interface ComponentContext {
  componentName?: string;
  propName?: string;
  componentProps?: Record<string, unknown>;
}

export interface ProcessingResult {
  matchedFilePath?: string;
  lineNumber?: number;
  matchContext?: string;
  alternativeMatches?: Array<{
    filePath: string;
    lineNumber: number;
    confidence: number;
    context: string;
  }>;
  errorMessage?: string;
  confidence?: number;
  hasConflicts?: boolean;
}

export interface PuppeteerTextEdit {
  id?: string;
  projectId: string; 
  originalText: string;
  newText: string;
  status: 'pending' | 'processing' | 'applied' | 'failed' | 'conflict';
  confidence?: number;
  elementContext: ElementContext;
  surroundingContext?: SurroundingContext;
  pageContext: PageContext;
  componentContext?: ComponentContext | null;
  processingResult?: ProcessingResult;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface EditContext {
  originalText: string;
  newText: string;
  projectId?: string; 
  elementContext: ElementContext;
  surroundingContext?: SurroundingContext;
  pageContext: PageContext;
  componentContext?: ComponentContext | null;
}

export interface FileMatch {
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

export interface ScoredMatch extends FileMatch {
  score: number;
  confidence: number;
  reasons: string[];
}

export interface TextEditorConfig {
  projectId: string;  
  apiEndpoint?: string;        
  enabledByDefault?: boolean;    
  showToggle?: boolean;       
  theme?: 'light' | 'dark';
  allowedOrigins?: string[];  
  projectRoot?: string;
}

export interface TextEditorWrapperProps {
  children: React.ReactNode;
  config: TextEditorConfig;
}


export interface DatabaseSchema {
  version: string;
  tables: {
    puppeteer_text_edits: {
      columns: Record<string, string>;
      indexes: string[];
    };
  };
}


export interface ProjectSummary {
  projectId: string;
  totalEdits: number;
  pendingEdits: number;
  appliedEdits: number;
  failedEdits: number;
  lastEdit: Date | null;
}

export interface ProjectInfo {
  projectId: string;
  name?: string;
  domain?: string;
  description?: string;
  totalEdits: number;
  lastEdit: Date;
  status: 'active' | 'inactive' | 'archived';
}
