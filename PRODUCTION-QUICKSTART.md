# 🚀 5-Minute Production Setup

## What's Different?

| Environment | How It Works | Speed |
|-------------|--------------|-------|
| **Development** | ✏️ Edits files directly | Instant |
| **Production** | 💾 Saves to DB → GitHub Action → Deploy | 2-5 min |

---

## ⚡ Quick Setup (GitHub Actions)

### Step 1: Add Environment Variables to Vercel/Netlify

```bash
DATABASE_URL=postgresql://user:pass@host:5432/db
NEXT_PUBLIC_PROJECT_ID=my-project
NEXT_PUBLIC_SITE_URL=https://yourdomain.com
SYNC_SECRET_TOKEN=abc123xyz789  # Random string
GITHUB_ACTIONS_TOKEN=ghp_xxxxx   # From GitHub
GITHUB_REPOSITORY=username/repo
```

### Step 2: Create GitHub Token

1. https://github.com/settings/tokens
2. Generate new token (classic)
3. Check: `repo` + `workflow`
4. Copy token → Save as `GITHUB_ACTIONS_TOKEN`

### Step 3: Add Secrets to GitHub Repo

1. Your repo → Settings → Secrets → Actions
2. Add: `DATABASE_URL` and `NEXT_PUBLIC_PROJECT_ID`

### Step 4: Deploy!

```bash
git add .
git commit -m "Add production text editing"
git push origin main
```

---

## ✅ Verify It Works

### Test Development Mode:
```bash
npm run dev
# Edit text on site → Check files changed ✓
```

### Test Production Mode:
```bash
npm run build
NODE_ENV=production npm start
# Edit text on site → Check database ✓
# Watch GitHub Actions run ✓
# See changes after 2-5 minutes ✓
```

---

## 🎯 That's It!

Your system now:
- ✅ **Dev**: Instant file edits
- ✅ **Prod**: Database → GitHub Actions → Deploy

Files created:
- `.github/workflows/apply-edits.yml` - Auto-runs every 5 min
- `src/app/api/text-editor/trigger-sync/route.ts` - Triggers GitHub
- `src/app/api/text-editor/route.ts` - Updated to detect production

---

## 📊 Monitor Edits

View pending edits in your database:
```sql
SELECT * FROM inline_edits 
WHERE status = 'pending' 
ORDER BY created_at DESC;
```

---

## 🔧 Optional: Manual Trigger

Run GitHub Action manually:
```bash
# Via GitHub UI
# Go to: Actions → Apply Pending Text Edits → Run workflow

# Or via command line
npm run apply-edits
```

---

## 🎉 Done!

See full docs: `PRODUCTION-SETUP.md` for advanced configurations.

