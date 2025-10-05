/**
 * Production API: Trigger GitHub Actions to apply edits
 * 
 * Call this after saving edits to database in production
 */
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Verify this is coming from your app (add proper auth)
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.SYNC_SECRET_TOKEN;
    
    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Trigger GitHub Actions via repository_dispatch
    const githubToken = process.env.GITHUB_ACTIONS_TOKEN;
    const githubRepo = process.env.GITHUB_REPOSITORY; // e.g., "username/repo-name"
    
    if (!githubToken || !githubRepo) {
      return NextResponse.json({ 
        error: 'GitHub configuration missing. Set GITHUB_ACTIONS_TOKEN and GITHUB_REPOSITORY' 
      }, { status: 500 });
    }

    const response = await fetch(
      `https://api.github.com/repos/${githubRepo}/dispatches`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${githubToken}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({
          event_type: 'apply-edits',
          client_payload: {
            timestamp: new Date().toISOString(),
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('GitHub API error:', error);
      return NextResponse.json({ 
        error: 'Failed to trigger sync',
        details: error 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      message: 'Sync triggered successfully. Changes will be deployed in ~2-5 minutes.' 
    });

  } catch (error) {
    console.error('Error triggering sync:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }, { status: 500 });
  }
}

