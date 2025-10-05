/**
 * Debug API: Test text matching without actually editing
 */
import { NextRequest, NextResponse } from 'next/server';
import { TextProcessor } from '@/lib/text-processor';
import * as fs from 'fs';
import * as path from 'path';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { originalText, pageUrl } = body;

    if (!originalText) {
      return NextResponse.json({ error: 'originalText is required' }, { status: 400 });
    }

    const textProcessor = new TextProcessor();
    const projectRoot = process.cwd();

    // Get basic info
    const projectInfo = await textProcessor.getProjectInfo();
    
    // Check if files exist
    const testPaths = [
      path.join(projectRoot, 'src/app/page.tsx'),
      path.join(projectRoot, 'src/components'),
      path.join(projectRoot, 'src/lib'),
    ];

    const fileChecks = testPaths.map(testPath => ({
      path: testPath,
      exists: fs.existsSync(testPath),
      type: fs.existsSync(testPath) ? (fs.statSync(testPath).isDirectory() ? 'directory' : 'file') : 'missing'
    }));

    // Try to find the text
    const testEditContext = {
      originalText,
      newText: originalText, // Same, just testing search
      projectId: 'debug-test',
      elementContext: {
        elementTag: 'span',
        cssSelector: 'span',
        elementPath: 'span',
      },
      pageContext: {
        pageUrl: pageUrl || '/',
      },
    };

    const result = await textProcessor.processTextEdit(testEditContext);

    return NextResponse.json({
      success: true,
      debug: {
        searchText: originalText,
        textLength: originalText.length,
        projectRoot,
        projectInfo,
        fileChecks,
        searchResult: {
          success: result.success,
          confidence: result.confidence,
          matchedFile: result.matchedFilePath,
          lineNumber: result.lineNumber,
          errorMessage: result.errorMessage,
          alternativeMatches: result.alternativeMatches?.length || 0,
        },
      },
    });

  } catch (error) {
    console.error('[Debug API] Error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    }, { status: 500 });
  }
}

