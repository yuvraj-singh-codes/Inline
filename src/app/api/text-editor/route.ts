/**
 * Portable Text Editor API Route
 * 
 * Main API endpoint for handling text edits
 * Drop this into any Next.js project's src/app/api/text-editor/route.ts
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Import portable modules (adjust paths as needed)
import { TextProcessor } from '@/lib/text-processor';
import { getDatabase } from '@/lib/database-client';
import { PuppeteerTextEdit } from '@/lib/types/database-types';

const ElementContextSchema = z.object({
  elementTag: z.string(),
  elementClasses: z.array(z.string()).optional(),
  elementId: z.string().optional(),
  heroPageElementId: z.string().nullable().optional(),
  cssSelector: z.string(),
  elementPath: z.string(),
});

const SurroundingContextSchema = z.object({
  parentText: z.string().optional(),
  siblingsBefore: z.array(z.string()).optional(),
  siblingsAfter: z.array(z.string()).optional(),
  nearbyUniqueText: z.string().optional(),
  ancestorContext: z.array(z.object({
    tag: z.string(),
    classes: z.array(z.string()).optional(),
    id: z.string().optional(),
    textContent: z.string().optional(),
    attributeData: z.record(z.string(), z.unknown()).nullable().optional(),
  })).optional(),
  elementTextIndex: z.number().optional(),
  precedingTextNodes: z.array(z.string()).optional(),
  followingTextNodes: z.array(z.string()).optional(),
  uniqueIdentifiers: z.array(z.string()).optional(),
  detailedPath: z.array(z.object({
    tag: z.string(),
    classes: z.array(z.string()).optional(),
    id: z.string().optional(),
    position: z.number().optional(),
    textSnippet: z.string().optional(),
  })).optional(),
});

const PageContextSchema = z.object({
  pageUrl: z.string(),
  pageTitle: z.string().optional(),
  fullUrl: z.string().optional(),
});

const ComponentContextSchema = z.object({
  componentName: z.string().optional(),
  propName: z.string().optional(),
  componentProps: z.record(z.string(), z.any()).optional(),
});

const EditRequestSchema = z.object({
  originalText: z.string(),
  newText: z.string(),
  projectId: z.string(), // Required project identification
  elementContext: ElementContextSchema,
  surroundingContext: SurroundingContextSchema,
  pageContext: PageContextSchema,
  componentContext: ComponentContextSchema.nullable().optional(),
});


const ALLOWED_ORIGINS = [
  `${process.env.NEXT_PUBLIC_SITE_URL}`,
  // Add your production domains here
];


async function isAllowedOrigin(origin: string): Promise<boolean> {
  return ALLOWED_ORIGINS.includes(origin) || 
         process.env.NODE_ENV === 'development';
}

function addCorsHeaders(response: NextResponse, origin?: string): NextResponse {
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
  }
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  return response;
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');

  if (origin && !(await isAllowedOrigin(origin))) {
    return new NextResponse(null, { status: 403 });
  }

  const response = new NextResponse(null, { status: 200 });
  return addCorsHeaders(response, origin || undefined);
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');

  if (origin && !(await isAllowedOrigin(origin))) {
    console.error('Origin not allowed:', origin);
    return NextResponse.json({ error: 'CORS not allowed' }, { status: 403 });
  }

  try {
   
    const body = await request.json();
    console.log('[API DEBUG] Received request body:', JSON.stringify(body, null, 2));
    const editData = EditRequestSchema.parse(body);
    console.log('[API DEBUG] Schema validation passed');

 
    const database = getDatabase();
    const isProduction = process.env.NODE_ENV === 'production';


    const editRecord: PuppeteerTextEdit = {
      originalText: editData.originalText,
      newText: editData.newText,
      status: isProduction ? 'pending' : 'processing',
      confidence: 0,
      projectId: editData.projectId,
      elementContext: editData.elementContext,
      surroundingContext: editData.surroundingContext,
      pageContext: editData.pageContext,
      componentContext: editData.componentContext,
      metadata: {
        userAgent: request.headers.get('user-agent'),
        timestamp: new Date().toISOString(),
        origin: origin || 'unknown',
      },
    };

    const editId = await database.saveEdit(editRecord);

    // In production: Save to database and trigger GitHub Actions
    if (isProduction) {
      console.log('[PRODUCTION] Edit saved to database, triggering sync...');
      
      // Trigger GitHub Actions workflow (non-blocking)
      try {
        const syncToken = process.env.SYNC_SECRET_TOKEN;
        if (syncToken) {
          await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/text-editor/trigger-sync`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${syncToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ editId }),
          });
        }
      } catch (syncError) {
        console.error('[PRODUCTION] Sync trigger failed (non-fatal):', syncError);
      }

      return NextResponse.json({
        success: true,
        editId,
        projectId: editData.projectId,
        message: 'Edit saved to database. Changes will be deployed in 2-5 minutes.',
        mode: 'production',
        status: 'pending',
      }, { status: 202 });
    }

    // In development: Apply changes immediately
    const textProcessor = new TextProcessor();
    const processEditData = {
      ...editData,
      elementContext: {
        ...editData.elementContext,
        heroPageElementId: editData.elementContext.heroPageElementId || undefined,
      },
      componentContext: editData.componentContext || undefined,
    };
    console.log('[API DEBUG] Processing text edit with data:', JSON.stringify(processEditData, null, 2));
    const result = await textProcessor.processTextEdit(processEditData);
    console.log('[API DEBUG] Text processing result:', JSON.stringify(result, null, 2));

    const finalStatus: PuppeteerTextEdit['status'] = result.success ? 'applied' : 'failed';
    await database.updateEditStatus(editId, finalStatus, {
      matchedFilePath: result.matchedFilePath,
      lineNumber: result.lineNumber,
      matchContext: result.matchContext,
      alternativeMatches: result.alternativeMatches,
      errorMessage: result.errorMessage,
      confidence: result.confidence,
      hasConflicts: result.hasConflicts,
    });


    const responseData = {
      success: result.success,
      editId,
      projectId: editData.projectId,
      confidence: result.confidence,
      matchedFilePath: result.matchedFilePath,
      lineNumber: result.lineNumber,
      hasConflicts: result.hasConflicts,
      message: result.success 
        ? `Successfully updated text in ${result.matchedFilePath} at line ${result.lineNumber}`
        : result.errorMessage || 'Edit failed',
      alternativeMatches: result.alternativeMatches?.length || 0,
    };

    const response = NextResponse.json(responseData, { 
      status: result.success ? 200 : 400 
    });
    
    return addCorsHeaders(response, origin || undefined);

  } catch (error) {
    console.error('[API ERROR] Error processing text edit:', error);

    let errorMessage = 'Internal server error';
    let statusCode = 500;

    if (error instanceof z.ZodError) {
      console.error('[API ERROR] Zod validation errors:', error.issues);
      errorMessage = 'Invalid data format: ' + error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      statusCode = 400;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    const response = NextResponse.json({ 
      error: errorMessage,
      success: false 
    }, { status: statusCode });

    return addCorsHeaders(response, origin || undefined);
  }
}
