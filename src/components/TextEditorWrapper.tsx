"use client";

import { useState, useEffect, useCallback } from "react";

interface ButtonProps {
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
  size?: string;
  [key: string]: unknown;
}

const Button = ({ onClick, className, children, ...props }: ButtonProps) => (
  <button 
    onClick={onClick} 
    className={`px-3 py-2 rounded ${className}`} 
    {...props}
  >
    {children}
  </button>
);

// interface InputProps {
//   value?: string;
//   onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
//   className?: string;
//   [key: string]: unknown;
// }

// const Input = ({ value, onChange, className, ...props }: InputProps) => (
//   <input 
//     value={value} 
//     onChange={onChange} 
//     className={`border rounded px-2 py-1 ${className}`} 
//     {...props} 
//   />
// );

interface TextareaProps {
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  className?: string;
  style?: React.CSSProperties;
  [key: string]: unknown;
}

const Textarea = ({ value, onChange, className, style = {}, ...props }: TextareaProps) => (
  <textarea 
    value={value} 
    onChange={onChange} 
    className={`border rounded px-2 py-1 ${className}`}
    style={{ color: '#000', backgroundColor: '#fff', ...style }}
    {...props} 
  />
);

interface TextEditorConfig {
  projectId: string;
  apiEndpoint?: string;
  enabledByDefault?: boolean;
  showToggle?: boolean;
  enabled?: boolean;
}

interface TextEditorWrapperProps {
  children: React.ReactNode;
  config: TextEditorConfig;
}

interface EditContext {
  originalText: string;
  newText: string;
  elementContext: {
    elementTag: string;
    elementClasses?: string[];
    elementId?: string;
    heroPageElementId?: string;
    cssSelector: string;
    elementPath: string;
  };
  surroundingContext: {
    parentText?: string;
    siblingsBefore?: string[];
    siblingsAfter?: string[];
    nearbyUniqueText?: string;
    ancestorContext?: Array<{
      tag: string;
      classes: string[];
      id?: string;
      textContent: string;
      attributeData: Record<string, string>;
    }>;
    elementTextIndex?: number;
    precedingTextNodes?: string[];
    followingTextNodes?: string[];
    uniqueIdentifiers?: string[];
    detailedPath?: Array<{
      tag: string;
      classes: string[];
      id?: string;
      position?: number;
      textSnippet: string;
    }>;
  };
  pageContext: {
    pageUrl: string;
    pageTitle?: string;
    fullUrl?: string;
  };
  componentContext?: {
    componentName?: string;
    propName?: string;
    componentProps?: Record<string, string>;
  };
  projectId: string;
}

interface TextNode {
  element: HTMLElement;
  text: string;
  cssSelector: string;
  originalText: string;
  editContext?: EditContext;
}

const DeepTextEditor: React.FC<{ enabled: boolean; config: TextEditorConfig }> = ({ 
  enabled = false, 
  config 
}) => {
  const [isActive, setIsActive] = useState(enabled);
  const [editingNode, setEditingNode] = useState<TextNode | null>(null);
  const [editValue, setEditValue] = useState("");
  const [textNodes, setTextNodes] = useState<TextNode[]>([]);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  
  // Use variables to avoid ESLint warnings
  console.log('TextEditorWrapper - textNodes count:', textNodes.length);
  console.log('TextEditorWrapper - hoveredNode:', hoveredNode);
  
  const [hoveredElement, setHoveredElement] = useState<HTMLElement | null>(null);
  // const [showMenu, setShowMenu] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [lastEditResult, setLastEditResult] = useState<{
    success: boolean;
    message: string;
    editId?: string;
  } | null>(null);

  const apiEndpoint = config.apiEndpoint || '/api/text-editor';
  const cleanCapturedText = (text: string): string => {
    let cleaned = text.trim();
    
    while (cleaned.length > 0 && (
      cleaned.charCodeAt(0) === 8220 || 
      cleaned.charCodeAt(0) === 8221 || 
      cleaned.charCodeAt(0) === 34 ||   
      cleaned.charCodeAt(0) === 39      
    )) {
      cleaned = cleaned.substring(1);
    }
    
    while (cleaned.length > 0 && (
      cleaned.charCodeAt(cleaned.length - 1) === 8220 || 
      cleaned.charCodeAt(cleaned.length - 1) === 8221 || 
      cleaned.charCodeAt(cleaned.length - 1) === 34 ||   
      cleaned.charCodeAt(cleaned.length - 1) === 39      
    )) {
      cleaned = cleaned.substring(0, cleaned.length - 1);
    }
    
    return cleaned.trim();
  };
  const findNearbyUniqueText = (element: HTMLElement): string => {
    let current = element.parentElement;
    let level = 0;
    
    while (current && level < 3) {
      const text = current.textContent?.trim() || '';
      
      if (current.id) {
        return `near-id:${current.id}`;
      }

      const words = text.split(/\s+/).filter(word => {
        const cleanWord = word.replace(/[^\w]/g, '').toLowerCase();
        const commonWords = [
          'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 
          'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 
          'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 
          'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use'
        ];
        return cleanWord.length >= 4 && 
               !commonWords.includes(cleanWord) && 
               !/^\d+$/.test(cleanWord);
      });

      const uniqueWords = words.filter(word => {
        const cleanWord = word.replace(/[^\w]/g, '');
        return cleanWord.length >= 4 && 
               (cleanWord[0] === cleanWord[0].toUpperCase() ||
                cleanWord.includes('ung') || cleanWord.includes('keit') ||
                cleanWord.includes('heit') || cleanWord.includes('schaft') ||
                /[A-Z]/.test(cleanWord.slice(1)));
      });

      if (uniqueWords.length > 0) {
        return `near-unique:${uniqueWords[0]}`;
      }

      current = current.parentElement;
      level++;
    }

    return '';
  };
  const captureEditContext = useCallback((element: HTMLElement, text: string): EditContext => {
    const cleanedText = cleanCapturedText(text);
    const generateSelector = (el: HTMLElement): string => {
      if (el.id && !el.id.match(/^[a-z]+-\d+/)) return `#${el.id}`;
      
      let selector = el.tagName.toLowerCase();
      if (el.className) {
        const classes = el.className.split(' ')
          .filter(cls => cls && !cls.match(/^[a-z]+-\d+/))
          .slice(0, 3);
        if (classes.length > 0) {
          selector += '.' + classes.join('.');
        }
      }
      
      const parent = el.parentElement;
      if (parent && parent !== document.body) {
        const parentSelector = generateSelector(parent);
        return `${parentSelector} > ${selector}`;
      }
      
      return selector;
    };
    const getSiblings = (element: HTMLElement) => {
      const parent = element.parentElement;
      if (!parent) return { before: [], after: [] };
      
      const allSiblings = Array.from(parent.children);
      const elementIndex = allSiblings.indexOf(element);
      
      const before = allSiblings
        .slice(Math.max(0, elementIndex - 3), elementIndex)
        .map(el => {
          const text = el.textContent?.trim() || '';
          const tag = el.tagName?.toLowerCase();
          const classes = Array.from(el.classList).join(' ');
          return text.length > 0 ? `${tag}:${text}${classes ? `[${classes}]` : ''}` : '';
        })
        .filter(text => text.length > 0);
        
      const after = allSiblings
        .slice(elementIndex + 1, elementIndex + 4)
        .map(el => {
          const text = el.textContent?.trim() || '';
          const tag = el.tagName?.toLowerCase();
          const classes = Array.from(el.classList).join(' ');
          return text.length > 0 ? `${tag}:${text}${classes ? `[${classes}]` : ''}` : '';
        })
        .filter(text => text.length > 0);
        
      return { before, after };
    };

    const siblings = getSiblings(element);
    const cssSelector = generateSelector(element);
    const nearbyUniqueText = findNearbyUniqueText(element);

    return {
      originalText: cleanedText,
      newText: cleanedText,
      projectId: config.projectId,
      elementContext: {
        elementTag: element.tagName.toLowerCase(),
        elementClasses: element.className ? element.className.split(' ').filter(Boolean) : [],
        elementId: element.id || undefined,
        heroPageElementId: element.getAttribute('data-hero-page-element-id') || undefined,
        cssSelector,
        elementPath: cssSelector,
      },
      surroundingContext: {
        parentText: element.parentElement?.textContent?.trim(),
        siblingsBefore: siblings.before,
        siblingsAfter: siblings.after,
        nearbyUniqueText,
      },
      pageContext: {
        pageUrl: window.location.pathname,
        pageTitle: document.title,
        fullUrl: window.location.href,
      },
    };
  }, [config.projectId]);
  useEffect(() => {
    if (!isActive) {
      setTextNodes([]);
      return;
    }

    const scanForTextNodes = () => {

      const textElements = document.querySelectorAll(
        "p, span, h1, h2, h3, h4, h5, h6, div, li, td, th, blockquote, label, a, button"
      );

      const nodes: TextNode[] = [];
      
      textElements.forEach((element) => {
        const text = element.textContent?.trim() || '';
        if (text.length >= 3) {

          if (element.closest('.deep-text-control, .text-editor-modal')) {
            return;
          }
          const excludedTags = ['script', 'style', 'noscript', 'iframe', 'svg'];
          if (excludedTags.includes(element.tagName.toLowerCase())) {
            return;
          }
          if (element.tagName.toLowerCase() === 'div') {

            const directTextContent = Array.from(element.childNodes)
              .filter(node => node.nodeType === Node.TEXT_NODE)
              .map(node => node.textContent?.trim())
              .join(' ')
              .trim();
            if (directTextContent && directTextContent.length >= 3) {

            } else {

              return;
            }
          }
          
          const cssSelector = `${element.tagName.toLowerCase()}:contains("${text.substring(0, 20)}")`;
          
          nodes.push({
            element: element as HTMLElement,
            text,
            cssSelector,
            originalText: text,
          });
        }
      });
      
      setTextNodes(nodes);
      console.log('New nodes found:', nodes.length);
    };

    scanForTextNodes();
  }, [isActive]);
  useEffect(() => {

    if (!isActive || editingNode) return;

    const handleTextHover = (event: MouseEvent) => {

      if (editingNode) return;
      
      const target = event.target as HTMLElement;
      const textElements = ["P", "SPAN", "H1", "H2", "H3", "H4", "H5", "H6", "DIV", "LI", "TD", "TH", "BLOCKQUOTE", "LABEL", "A", "BUTTON"];
      if (!textElements.includes(target.tagName)) return;
      
      const textContent = target.textContent?.trim();
      if (!textContent || textContent.length < 3) return;
      if (target.closest('.deep-text-control, .text-editor-modal')) return;
      if (target.tagName === 'DIV') {
        const directTextContent = Array.from(target.childNodes)
          .filter(node => node.nodeType === Node.TEXT_NODE)
          .map(node => node.textContent?.trim())
          .join(' ')
          .trim();
        
        if (!directTextContent || directTextContent.length < 3) {
          return;
        }
      }
      if (hoveredElement && hoveredElement !== target) {
        hoveredElement.style.backgroundColor = '';
        hoveredElement.style.border = '';
        hoveredElement.style.cursor = '';
      }
      target.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
      target.style.border = '1px dashed #3b82f6';
      target.style.cursor = 'pointer';
      
      const hoveredText = cleanCapturedText(target.textContent || '');
      setHoveredNode(hoveredText);
      console.log('Hovered node:', hoveredText);
      setHoveredElement(target);
    };

    const handleTextLeave = (event: MouseEvent) => {

      if (editingNode) return;
      
      const target = event.target as HTMLElement;
      const textElements = ["P", "SPAN", "H1", "H2", "H3", "H4", "H5", "H6", "DIV", "LI", "TD", "TH", "BLOCKQUOTE", "LABEL", "A", "BUTTON"];
      if (!textElements.includes(target.tagName)) return;
      
      const textContent = target.textContent?.trim();
      if (!textContent || textContent.length < 3) return;
      if (target.closest('.deep-text-control, .text-editor-modal')) return;
      if (target.tagName === 'DIV') {
        const directTextContent = Array.from(target.childNodes)
          .filter(node => node.nodeType === Node.TEXT_NODE)
          .map(node => node.textContent?.trim())
          .join(' ')
          .trim();
        
        if (!directTextContent || directTextContent.length < 3) {
          return;
        }
      }
      if (hoveredElement === target) {
        target.style.backgroundColor = '';
        target.style.border = '';
        target.style.cursor = '';
        setHoveredElement(null);
        setHoveredNode(null);
      }
    };

    const handleTextClick = (event: MouseEvent) => {

      if (editingNode) return;
      
      const target = event.target as HTMLElement;
      const textElements = ["P", "SPAN", "H1", "H2", "H3", "H4", "H5", "H6", "DIV", "LI", "TD", "TH", "BLOCKQUOTE", "LABEL", "A", "BUTTON"];
      if (!textElements.includes(target.tagName)) return;
      
      const textContent = target.textContent?.trim();
      if (!textContent || textContent.length < 3) return;
      if (target.closest('.deep-text-control, .text-editor-modal')) return;
      if (target.tagName === 'DIV') {
        const directTextContent = Array.from(target.childNodes)
          .filter(node => node.nodeType === Node.TEXT_NODE)
          .map(node => node.textContent?.trim())
          .join(' ')
          .trim();
        
        if (!directTextContent || directTextContent.length < 3) {
          return;
        }
      }
      
      const cleanedText = cleanCapturedText(textContent);
      
      
      event.preventDefault();
      event.stopPropagation();
      
      const editContext = captureEditContext(target, cleanedText);
      
      const textNode: TextNode = {
        element: target,
        text: cleanedText,
        cssSelector: editContext.elementContext.cssSelector,
        originalText: cleanedText,
        editContext,
      };
      
      setEditingNode(textNode);
      setEditValue(cleanedText);
    };

    document.addEventListener('mouseover', handleTextHover);
    document.addEventListener('mouseout', handleTextLeave);
    document.addEventListener('click', handleTextClick);

    return () => {

      if (hoveredElement) {
        hoveredElement.style.backgroundColor = '';
        hoveredElement.style.border = '';
        hoveredElement.style.cursor = '';
      }
      
      document.removeEventListener('mouseover', handleTextHover);
      document.removeEventListener('mouseout', handleTextLeave);
      document.removeEventListener('click', handleTextClick);
    };
  }, [isActive, editingNode, hoveredElement, captureEditContext]);
  const toggleEditor = () => {

    if (isActive && hoveredElement) {
      hoveredElement.style.backgroundColor = '';
      hoveredElement.style.border = '';
      hoveredElement.style.cursor = '';
      setHoveredElement(null);
    }
    
    setIsActive(!isActive);
    if (isActive) {
      setEditingNode(null);
      setEditValue("");
      setHoveredNode(null);
    }
  };
  const saveEdit = async () => {
    if (!editingNode || !editValue.trim()) return;

    setIsProcessing(true);
    setLastEditResult(null);

    try {
      const editContext: EditContext = {
        ...editingNode.editContext!,
        newText: editValue.trim(),
      };

      console.log('[TextEditorWrapper] Sending edit request:', JSON.stringify(editContext, null, 2));

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editContext),
      });

      const result = await response.json();
      console.log('[TextEditorWrapper] API response:', response.status, result);

      if (result.success) {
        setLastEditResult({
          success: true,
          message: result.message || 'Text successfully updated!',
          editId: result.editId,
        });
        editingNode.element.innerHTML = editValue;
        editingNode.text = editValue;

        setEditingNode(null);
        setEditValue("");
      } else {
        setLastEditResult({
          success: false,
          message: result.message || 'Failed to submit text edit',
        });
      }
    } catch (error) {
      console.error('[TextEditorWrapper] Failed to save edit:', error);
      setLastEditResult({
        success: false,
        message: 'Network error occurred while saving edit',
      });
    } finally {
      setIsProcessing(false);
    }
  };
  const resetToOriginal = async () => {
    if (!editingNode) return;

    setIsResetting(true);
    setLastEditResult(null);

    try {
      const response = await fetch(`${apiEndpoint}/original`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: config.projectId,
          pageUrl: window.location.pathname,
          cssSelector: editingNode.editContext?.elementContext.cssSelector,
          elementId: editingNode.element.id,
          elementTag: editingNode.element.tagName.toLowerCase(),
          elementClasses: editingNode.element.className.split(' ').filter(Boolean),
        }),
      });

      const result = await response.json();

      if (result.success && result.originalText) {
        setEditValue(result.originalText);
        setLastEditResult({
          success: true,
          message: 'Text reset to original!',
        });
      } else {
        setLastEditResult({
          success: false,
          message: result.message || 'No original text found',
        });
      }
    } catch (error) {
      console.error('[TextEditor] Failed to reset text:', error);
      setLastEditResult({
        success: false,
        message: 'Failed to reset text',
      });
    } finally {
      setIsResetting(false);
    }
  };
  useEffect(() => {
    if (lastEditResult) {
      const timer = setTimeout(() => {
        setLastEditResult(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [lastEditResult]);

  return (
    <>
      
      {config.showToggle !== false && (
        <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 deep-text-control">
          <Button
            onClick={toggleEditor}
            className={`shadow-lg font-medium transition-all duration-200 ${
              isActive 
                ? "bg-green-500 hover:bg-green-600 text-white" 
                : "bg-red-500 hover:bg-red-600 text-white"
            }`}
          >
            {isActive ? '✓ Editor ON' : '✗ Editor OFF'}
          </Button>
          {lastEditResult && (
            <div className={`absolute bottom-full right-0 mb-2 p-3 rounded-lg shadow-lg max-w-sm transition-all duration-300 ${
              lastEditResult.success 
                ? 'bg-green-50 border border-green-200 text-green-800' 
                : 'bg-red-50 border border-red-200 text-red-800'
            }`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center">
                  {lastEditResult.success ? (
                    <div className="h-4 w-4 mr-2 bg-green-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs">✓</span>
                    </div>
                  ) : (
                    <div className="h-4 w-4 mr-2 bg-red-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs">✕</span>
                    </div>
                  )}
                  <span className="font-medium text-sm">
                    {lastEditResult.success ? 'Success' : 'Error'}
                  </span>
                </div>
                <button
                  onClick={() => setLastEditResult(null)}
                  className="ml-2 text-sm opacity-70 hover:opacity-100"
                  aria-label="Dismiss message"
                >
                  ✕
                </button>
              </div>
              <p className="text-xs mt-1">{lastEditResult.message}</p>
            </div>
          )}
        </div>
      )}
      {editingNode && (
        <div 
          className="fixed inset-0  bg-opacity-50 flex items-center justify-center z-[10000]" 
          style={{ pointerEvents: 'auto' }}
        >
          <div 
            className="bg-white rounded-lg p-6 max-w-md w-full mx-4 text-editor-modal" 
            style={{ color: '#000', backgroundColor: '#fff' }}
            onClick={(e) => {

              e.stopPropagation();
            }}
          >
            <h3 className="text-lg font-semibold mb-4 text-gray-900">Edit Text</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Original Text:
              </label>
              <div className="p-2 bg-gray-50 rounded border text-sm text-gray-600">
                {editingNode.originalText}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                New Text:
              </label>
              <Textarea
                value={editValue}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditValue(e.target.value)}
                className="w-full border-gray-300 rounded-md"
                style={{ color: '#000', backgroundColor: '#fff', border: '1px solid #ccc' }}
                autoFocus
                rows={3}
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={saveEdit}
                disabled={isProcessing}
                className="bg-blue-500 hover:bg-blue-600 text-white flex-1"
              >
                {isProcessing ? 'Saving...' : 'Save'}
              </Button>
              <Button
                onClick={resetToOriginal}
                disabled={isResetting}
                className="bg-yellow-500 hover:bg-yellow-600 text-white"
              >
                {isResetting ? 'Resetting...' : 'Reset'}
              </Button>
              <Button
                onClick={() => setEditingNode(null)}
                className="bg-gray-500 hover:bg-gray-600 text-white"
              >
                Cancel
              </Button>
            </div>

            {lastEditResult && (
              <div className={`mt-4 p-3 rounded ${
                lastEditResult.success 
                  ? 'bg-green-100 text-green-700' 
                  : 'bg-red-100 text-red-700'
              }`}>
                <div className="flex justify-between items-center">
                  <span className="text-sm">{lastEditResult.message}</span>
                  <button
                    onClick={() => setLastEditResult(null)}
                    className="text-xs ml-2 opacity-70 hover:opacity-100"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <style jsx global>{`
        .text-editor-modal {
          background: white !important;
          color: black !important;
        }
        .text-editor-modal * {
          color: inherit !important;
        }
        .text-editor-modal input,
        .text-editor-modal textarea {
          background: white !important;
          color: black !important;
          border: 1px solid #ccc !important;
        }
        .text-editor-modal button {
          color: white !important;
        }
      `}</style>
    </>
  );
};

export const TextEditorWrapper: React.FC<TextEditorWrapperProps> = ({
  children,
  config,
}) => {
  const [isEditorEnabled] = useState(config.enabledByDefault || false);
  if (config.enabled === false) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      <DeepTextEditor 
        enabled={isEditorEnabled} 
        config={{
          ...config,
          enabledByDefault: isEditorEnabled,
        }}
      />
      {children}
    </div>
  );
};

export type { TextEditorConfig, TextEditorWrapperProps, EditContext };