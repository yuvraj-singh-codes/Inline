# 🏗️ Text Editing Architecture: Dev vs Production

## 📋 Current System (Development Only)

```
┌──────────┐
│   User   │ Edits text on webpage
└────┬─────┘
     │
     ▼
┌──────────────────┐
│  Text Editor     │ Captures context (CSS, siblings, etc.)
│  (Frontend)      │
└────┬─────────────┘
     │
     ▼ HTTP POST
┌──────────────────┐
│  API Route       │ /api/text-editor
│  route.ts        │
└────┬─────────────┘
     │
     ▼
┌──────────────────┐
│  TextProcessor   │ Smart context matching
│  text-processor  │ - Validates context
│  .ts             │ - Scores confidence
└────┬─────────────┘
     │
     ▼
┌──────────────────┐
│  fs.writeFile()  │ ✅ Works in DEV
│  Direct file     │ ❌ FAILS in PRODUCTION
│  editing         │    (read-only filesystem)
└──────────────────┘
```

---

## 🚀 New System (Production Ready)

### Development Mode (Unchanged)
```
User → API → TextProcessor → fs.writeFile() → ✅ Instant updates
```

### Production Mode (New!)
```
┌──────────┐
│   User   │ Edits text on webpage
└────┬─────┘
     │
     ▼
┌──────────────────┐
│  API Route       │ Detects: process.env.NODE_ENV === 'production'
│  route.ts        │ 
└────┬─────────────┘
     │
     ├─────────────────────────┐
     │                         │
     ▼                         ▼
┌──────────────┐      ┌──────────────────┐
│  Database    │      │  Trigger Webhook │
│  Save as     │      │  /trigger-sync   │
│  "pending"   │      │                  │
└──────────────┘      └────┬─────────────┘
                           │
     ┌─────────────────────┘
     │
     ▼
┌──────────────────────────────────┐
│  GitHub Actions Workflow         │
│  .github/workflows/apply-edits   │
│                                  │
│  Runs every 5 minutes OR on      │
│  webhook trigger                 │
└────┬─────────────────────────────┘
     │
     ▼
┌──────────────────┐
│  Runner Server   │ Temporary VM with filesystem access
│  (Ubuntu)        │
└────┬─────────────┘
     │
     ▼
┌──────────────────┐
│  apply-edits.js  │ 
│  1. Fetch pending edits from DB
│  2. Apply to files
│  3. Git commit
│  4. Git push
└────┬─────────────┘
     │
     ▼
┌──────────────────┐
│  Git Repository  │ New commit pushed
└────┬─────────────┘
     │
     ▼
┌──────────────────┐
│  Vercel/Netlify  │ Detects new commit
│  Auto Deploy     │ Rebuilds and deploys
└────┬─────────────┘
     │
     ▼
┌──────────────────┐
│  Production Site │ ✅ Changes visible (2-5 min delay)
└──────────────────┘
```

---

## 🔄 Complete Flow Example

### Scenario: User changes "Welcome" to "Hello"

#### Development:
```
1. User clicks text → Modal opens
2. User types "Hello" → Clicks Save
3. API receives edit → TextProcessor finds file
4. File written immediately → Page refreshes
5. ✅ User sees "Hello" (instant)
```

#### Production:
```
1. User clicks text → Modal opens
2. User types "Hello" → Clicks Save
3. API receives edit → Saves to database as "pending"
4. API triggers webhook → GitHub Actions starts
5. GitHub runner spins up → Clones repo
6. apply-edits.js runs → Fetches from database
7. Finds file → Applies change
8. Git commit + push → Triggers deploy
9. Vercel rebuilds → Deploys new version
10. ✅ User sees "Hello" (2-5 minutes later)
```

---

## 📊 Technical Comparison

| Aspect | Development | Production |
|--------|-------------|------------|
| **File Access** | Direct (fs.writeFile) | Via GitHub Actions |
| **Speed** | Instant | 2-5 minutes |
| **Persistence** | ✅ Changes in files | ✅ Changes in files |
| **Git History** | ⚠️ Manual commit | ✅ Auto-committed |
| **Safety** | ⚠️ No approval | ✅ Can add approval flow |
| **Rollback** | Manual | Git revert |
| **Audit Trail** | Logs only | Database + Git history |

---

## 🎯 Why This Architecture?

### Problem:
- Production servers (Vercel, Netlify) have **read-only filesystems**
- Direct file editing is **impossible in production**
- Changes need to be **committed to git** to persist

### Solution:
- Store edits in **database** (always works)
- Use **GitHub Actions** as a "writable environment"
- Let GitHub Actions **modify files and commit**
- Leverage **auto-deploy** to publish changes

### Benefits:
1. ✅ **Same codebase** for dev and prod (just different paths)
2. ✅ **Git history** of all content changes
3. ✅ **SEO-friendly** (changes in actual HTML)
4. ✅ **Works anywhere** (Vercel, Netlify, AWS, etc.)
5. ✅ **Secure** (only GitHub Actions can write files)

---

## 🔐 Security Considerations

### Development:
- Direct filesystem access
- Only accessible on localhost
- No external exposure

### Production:
- Database stores edits (encrypted connection)
- GitHub token required (secrets protected)
- CORS restrictions (only your domain)
- Auth token for webhook trigger

---

## 💰 Cost Analysis

### Infrastructure:
- **Database**: ~$5-10/month (or free tier)
- **GitHub Actions**: 2,000 minutes/month FREE
  - Each edit cycle: ~2-3 minutes
  - ~600+ edits/month on free tier
- **Hosting**: No extra cost (existing Vercel/Netlify)

### Time Cost:
- **Dev setup**: 5-10 minutes (one-time)
- **Per edit**: 0 seconds (automated)
- **User wait time**: 2-5 minutes

---

## 🎉 Summary

Your text editing system now supports **both environments**:

| Mode | Trigger | Action | Time |
|------|---------|--------|------|
| **Dev** | Save button | Write file directly | <1 sec |
| **Prod** | Save button | DB → GitHub → Deploy | 2-5 min |

Both end up with **the same result**: Changes committed to git, deployed to production, perfect for SEO.

The 2-5 minute delay is acceptable because content editing is typically done by:
- Marketing team (not time-critical)
- Content managers (batch updates)
- A/B testing (planned changes)

For instant updates without deploy, see `PRODUCTION-SETUP.md` Solution 2 (Database-driven).

