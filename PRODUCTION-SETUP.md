# 🚀 Production Text Editing Setup Guide

## 🎯 The Problem

The text editing system currently writes directly to files, which **won't work in production** because:
- ❌ Read-only filesystem (Vercel, Netlify, AWS Lambda)
- ❌ No git access to commit changes
- ❌ Changes don't persist across deployments

## 💡 Solution Overview

We support **3 production approaches**. Choose based on your needs:

| Approach | Best For | Deploy Time | SEO | Setup |
|----------|----------|-------------|-----|-------|
| **1. GitHub Actions** | Static sites, SEO-critical | 2-5 min | ✅ Perfect | Medium |
| **2. Database + API** | Dynamic content | Instant | ⚠️ CSR only | Easy |
| **3. Edge Rewriting** | High-traffic sites | Instant | ✅ Good | Hard |

---

## 📋 Solution 1: GitHub Actions (RECOMMENDED)

### How It Works:
```
User edits → Database → GitHub Action → Git commit → Auto-deploy
```

### ✅ Pros:
- Changes are in actual source code (perfect for SEO)
- Git history of all edits
- Works with any hosting (Vercel, Netlify, etc.)

### ⚠️ Cons:
- 2-5 minute delay for changes to appear
- Uses GitHub Actions minutes (usually free tier is enough)

### Setup:

#### 1. Add Environment Variables

**Development (.env.local):**
```bash
NODE_ENV=development
DATABASE_URL=postgresql://user:pass@host:5432/db
NEXT_PUBLIC_PROJECT_ID=my-project
```

**Production (Vercel/Netlify):**
```bash
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host:5432/db
NEXT_PUBLIC_PROJECT_ID=my-project
NEXT_PUBLIC_SITE_URL=https://yourdomain.com

# For GitHub Actions trigger
SYNC_SECRET_TOKEN=your-random-secret-token-here
GITHUB_ACTIONS_TOKEN=ghp_your_github_personal_access_token
GITHUB_REPOSITORY=username/repo-name
```

#### 2. Create GitHub Personal Access Token

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Name: `Text Editor Sync`
4. Permissions needed:
   - ✅ `repo` (Full control of private repositories)
   - ✅ `workflow` (Update GitHub Action workflows)
5. Copy token and save as `GITHUB_ACTIONS_TOKEN`

#### 3. Add Secrets to GitHub Repository

1. Go to your repo → Settings → Secrets and variables → Actions
2. Add these secrets:
   - `DATABASE_URL` - Your PostgreSQL connection string
   - `NEXT_PUBLIC_PROJECT_ID` - Your project identifier

#### 4. How It Works:

```mermaid
sequenceDiagram
    User->>Website: Edit text
    Website->>API: Save edit
    API->>Database: Store as "pending"
    API->>GitHub: Trigger workflow
    GitHub->>Runner: Run apply-edits.js
    Runner->>Database: Get pending edits
    Runner->>Files: Apply changes
    Runner->>Git: Commit + Push
    Git->>Deploy: Auto-deploy
    Deploy->>User: See changes (2-5 min)
```

#### 5. Testing:

```bash
# Test in development (applies immediately)
npm run dev

# Test GitHub Action locally
npm run apply-edits:dry-run

# Trigger manually via GitHub UI
# Go to Actions → Apply Pending Text Edits → Run workflow
```

---

## 📋 Solution 2: Database-Driven Content (Instant Updates)

### How It Works:
```
User edits → Database → React fetches → Render new text
```

### ✅ Pros:
- Instant updates (no deployment)
- Simple to implement
- Works anywhere

### ⚠️ Cons:
- Client-side rendering only (bad for SEO)
- Network request on every page load
- Database cost for high traffic

### Implementation:

Create `src/components/DynamicText.tsx`:

```typescript
'use client';

import { useState, useEffect } from 'react';

interface DynamicTextProps {
  textId: string;
  fallback: string;
  className?: string;
}

export function DynamicText({ textId, fallback, className }: DynamicTextProps) {
  const [text, setText] = useState(fallback);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchText() {
      try {
        const res = await fetch(`/api/text-editor/get-text?id=${textId}`);
        const data = await res.json();
        if (data.text) {
          setText(data.text);
        }
      } catch (error) {
        console.error('Failed to fetch dynamic text:', error);
      } finally {
        setLoading(false);
      }
    }
    
    if (process.env.NODE_ENV === 'production') {
      fetchText();
    } else {
      setLoading(false);
    }
  }, [textId]);

  if (loading) {
    return <span className={className}>{fallback}</span>;
  }

  return <span className={className}>{text}</span>;
}
```

Usage:
```tsx
// Instead of:
<h1>Welcome to our app</h1>

// Use:
<h1>
  <DynamicText 
    textId="home-hero-title" 
    fallback="Welcome to our app"
  />
</h1>
```

---

## 📋 Solution 3: Edge/CDN Rewriting (Advanced)

### How It Works:
```
User edits → Database → Edge Config → Rewrite at CDN
```

### ✅ Pros:
- Instant updates
- Perfect for SEO (server-rendered)
- No client-side JS needed

### ⚠️ Cons:
- Platform-specific (Vercel Edge Config, Cloudflare KV)
- More complex setup
- Limited to ~2MB of data

### Vercel Edge Config Setup:

```typescript
// src/middleware.ts
import { NextResponse } from 'next/server';
import { get } from '@vercel/edge-config';

export async function middleware(request: Request) {
  const response = NextResponse.next();
  
  // Get text overrides from Edge Config
  const textOverrides = await get('text-overrides');
  
  if (textOverrides) {
    // Modify HTML response
    const html = await response.text();
    let modifiedHtml = html;
    
    for (const [originalText, newText] of Object.entries(textOverrides)) {
      modifiedHtml = modifiedHtml.replace(originalText, newText as string);
    }
    
    return new NextResponse(modifiedHtml, {
      headers: response.headers,
    });
  }
  
  return response;
}
```

---

## 🎯 Recommended Setup

For most projects, use **Solution 1 (GitHub Actions)**:

1. ✅ Perfect SEO (changes in actual code)
2. ✅ Git history for auditing
3. ✅ Works with any hosting
4. ✅ 2-5 minute delay is acceptable for content edits

Only use Solution 2 if you need **instant updates** and don't care about SEO.

Only use Solution 3 if you're on Vercel/Cloudflare and need both instant + SEO.

---

## 🧪 Testing Production Mode Locally

```bash
# Build production version
npm run build

# Run in production mode
NODE_ENV=production npm start

# Test that edits go to database (not files)
# Edit text on site → Check database for "pending" status
```

---

## 🔍 Monitoring

Check edit status:
```sql
-- See pending edits
SELECT * FROM inline_edits 
WHERE status = 'pending' 
ORDER BY created_at DESC;

-- See recent applied edits
SELECT * FROM inline_edits 
WHERE status = 'applied' 
ORDER BY updated_at DESC 
LIMIT 10;
```

---

## ❓ FAQ

**Q: How do I know if it's working?**
A: Check your database for edits with `status = 'pending'`, then watch GitHub Actions run.

**Q: Can I approve edits before they deploy?**
A: Yes! Set `status = 'approved'` in database, then filter in `apply-edits.js`:
```javascript
WHERE status = 'approved'  // instead of 'pending'
```

**Q: What if GitHub Actions fails?**
A: Edits stay in database as "pending". Fix the issue, then re-run the workflow manually.

**Q: Can I disable editing in production?**
A: Yes! In `layout.tsx`:
```typescript
enabled: process.env.NODE_ENV === 'development'
```

---

## 🎉 You're Ready!

Your text editing system now works in both development and production:

- **Development**: Instant file edits
- **Production**: Database → GitHub Actions → Deploy

Deploy with confidence! 🚀

