/**
 * Portable Text Editor Original API Route
 * 
 * API endpoint for fetching original text for reset functionality
 * Drop this into any Next.js project's src/app/api/text-editor/original/route.ts
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDatabase } from '@/lib/database-client';


const OriginalTextRequestSchema = z.object({
  projectId: z.string(),
  pageUrl: z.string(),
  cssSelector: z.string().optional(),
  elementId: z.string().optional(),
  elementTag: z.string().optional(),
});

// CORS configuration - customize as needed
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

  // Check CORS
  if (origin && !(await isAllowedOrigin(origin))) {
    console.error('Origin not allowed for POST:', origin);
    return NextResponse.json({ error: 'CORS not allowed' }, { status: 403 });
  }

  try {
   
    const body = await request.json();
    const requestData = OriginalTextRequestSchema.parse(body);

   
    const database = getDatabase();

    
    const originalText = await database.getOriginalText({
      projectId: requestData.projectId,
      pageUrl: requestData.pageUrl,
      cssSelector: requestData.cssSelector,
      elementId: requestData.elementId,
      elementTag: requestData.elementTag,
    });

    if (originalText) {
      const response = NextResponse.json({ 
        originalText,
        success: true,
        projectId: requestData.projectId,
      });
      return addCorsHeaders(response, origin || undefined);
    } else {
      const response = NextResponse.json({ 
        error: 'No original text found in database for this project',
        success: false,
        projectId: requestData.projectId,
      }, { status: 404 });
      return addCorsHeaders(response, origin || undefined);
    }

  } catch (error) {
    console.error('Error fetching original text:', error);
    
    let errorMessage = 'Internal server error';
    let statusCode = 500;

    if (error instanceof z.ZodError) {
      console.error('Zod validation errors:', error.issues);
      errorMessage = 'Invalid request format: ' + error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
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


export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin');

  
  if (origin && !(await isAllowedOrigin(origin))) {
    console.error('Origin not allowed for GET:', origin);
    return NextResponse.json({ error: 'CORS not allowed' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const pageUrl = searchParams.get('pageUrl');
    const cssSelector = searchParams.get('cssSelector');
    const elementId = searchParams.get('elementId');
    const elementTag = searchParams.get('elementTag');

    if (!projectId || !pageUrl) {
      const response = NextResponse.json({ 
        error: 'projectId and pageUrl parameters are required' 
      }, { status: 400 });
      return addCorsHeaders(response, origin || undefined);
    }

   
    const database = getDatabase();

    
    const originalText = await database.getOriginalText({
      projectId,
      pageUrl,
      cssSelector: cssSelector || undefined,
      elementId: elementId || undefined,
      elementTag: elementTag || undefined,
    });

    if (originalText) {
      const response = NextResponse.json({ 
        originalText,
        success: true,
        projectId,
      });
      return addCorsHeaders(response, origin || undefined);
    } else {
      const response = NextResponse.json({ 
        error: 'No original text found in database for this project',
        success: false,
        projectId,
      }, { status: 404 });
      return addCorsHeaders(response, origin || undefined);
    }

  } catch (error) {
    console.error('Error fetching original text:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    const response = NextResponse.json({ 
      error: errorMessage,
      success: false 
    }, { status: 500 });

    return addCorsHeaders(response, origin || undefined);
  }
}
