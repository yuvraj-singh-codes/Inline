/**
 * ============================================================================
 * APPLY EDITS SCRIPT (Enhanced with TextProcessor)
 * ============================================================================
 * 
 * Purpose: Apply text edits from the database to source code files
 * 
 * When to use:
 *   - After making text edits on your live/production website
 *   - The edits are saved to database but NOT to source files in production
 *   - Run this script locally to apply database edits to your source code
 * 
 * Usage:
 *   npm run apply-edits              # Apply all pending edits
 *   npm run apply-edits:dry-run      # Preview what would change (safe)
 *   npm run apply-edits -- --project-id=my-project  # Specific project
 * 
 * Workflow:
 *   1. User edits text on live website → Saved to database
 *   2. Pull latest code: git pull
 *   3. Run this script: npm run apply-edits
 *   4. Review changes: git diff
 *   5. Commit and push: git add . && git commit -m "Apply edits" && git push
 * 
 * Features:
 *   ✅ Uses TextProcessor class (same as API route)
 *   ✅ Advanced context validation
 *   ✅ Confidence scoring (minimum 50%)
 *   ✅ Smart text normalization
 *   ✅ Dry-run mode for safety
 *   ✅ Status tracking in database
 * 
 * Requirements:
 *   - DATABASE_URL environment variable
 *   - NEXT_PUBLIC_PROJECT_ID environment variable (optional)
 * 
 * ============================================================================
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Import TextProcessor for advanced text matching
let TextProcessor;
try {
  // Try to import the compiled JS version
  const textProcessorModule = require('./src/lib/text-processor.ts');
  TextProcessor = textProcessorModule.TextProcessor;
} catch (error) {
  console.log('⚠️  Could not load TypeScript directly. Attempting to use ts-node...');
  try {
    require('ts-node/register');
    const textProcessorModule = require('./src/lib/text-processor.ts');
    TextProcessor = textProcessorModule.TextProcessor;
  } catch (tsError) {
    console.error('❌ Failed to load TextProcessor. Please ensure TypeScript files are compiled or ts-node is installed.');
    console.error('   Run: npm install --save-dev ts-node');
    process.exit(1);
  }
}

// Load environment variables from .env.local
try {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      let value = valueParts.join('=').trim();
      
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key.trim()] = value;
    }
  });
} catch (error) {
  console.log('⚠️  Could not load .env.local file');
}

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const projectIdArg = args.find(arg => arg.startsWith('--project-id='));
const projectId = projectIdArg ? projectIdArg.split('=')[1] : process.env.NEXT_PUBLIC_PROJECT_ID || 'default-project';

console.log(`🚀 Applying pending edits for project: ${projectId}`);
console.log(`📋 Mode: ${isDryRun ? 'DRY RUN (no changes will be applied)' : 'LIVE RUN'}`);
console.log(`🔗 Database URL: ${process.env.DATABASE_URL ? 'Set' : 'Not set'}`);

// Database connection
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ DATABASE_URL environment variable is required');
  console.error('   Please set DATABASE_URL in your .env.local file');
  process.exit(1);
}

console.log(`🔗 Using database: ${databaseUrl.substring(0, 30)}...`);

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false }
});

async function getPendingEdits() {
  let client;
  try {
    client = await pool.connect();
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('🔗 Check your DATABASE_URL and network connection');
    throw error;
  }
  
  try {
    const query = `
      SELECT 
        id,
        original_text,
        new_text,
        confidence,
        status,
        element_context_element_tag as element_tag,
        element_context_element_id as element_id,
        element_context_css_selector as css_selector,
        element_context_element_classes as element_classes,
        surrounding_context_parent_text as parent_text,
        surrounding_context_siblings_before as siblings_before,
        surrounding_context_siblings_after as siblings_after,
        page_context_page_url as page_url,
        page_context_page_title as page_title,
        page_context_full_url as full_url,
        metadata,
        created_at
      FROM inline_edits 
      WHERE 
        (status = 'processing' OR status = 'failed' OR status = 'pending')
        AND (metadata->>'projectId' = $1 OR metadata->>'projectId' IS NULL)
      ORDER BY created_at ASC
    `;
    
    const result = await client.query(query, [projectId]);
    return result.rows;
  } finally {
    client.release();
  }
}

async function updateEditStatus(editId, status, errorMessage = null, metadata = null) {
  const client = await pool.connect();
  try {
    const query = `
      UPDATE inline_edits 
      SET 
        status = $2,
        updated_at = NOW(),
        metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb
      WHERE id = $1
    `;
    
    const updateMetadata = metadata || (errorMessage ? { errorMessage } : {});
    await client.query(query, [editId, status, JSON.stringify(updateMetadata)]);
  } finally {
    client.release();
  }
}

async function applyEdit(edit, textProcessor) {
  console.log(`\n📝 Processing edit ${edit.id} (Status: ${edit.status}):`);
  console.log(`   Original: "${edit.original_text}"`);
  console.log(`   New: "${edit.new_text}"`);
  
  // Parse metadata if it's a string
  let metadata = edit.metadata;
  if (typeof metadata === 'string') {
    try {
      metadata = JSON.parse(metadata);
    } catch (e) {
      metadata = {};
    }
  }
  
  console.log(`   🔍 Context data:`, {
    element_tag: edit.element_tag,
    element_id: edit.element_id,
    css_selector: edit.css_selector,
    page_url: edit.page_url
  });
  
  if (isDryRun) {
    console.log(`   🔍 DRY RUN: Would apply this edit using TextProcessor`);
    return { success: true, isDryRun: true };
  }
  
  // Parse element classes if it's a string
  let elementClasses = edit.element_classes || metadata?.elementClasses || [];
  if (typeof elementClasses === 'string') {
    try {
      elementClasses = JSON.parse(elementClasses);
    } catch (e) {
      elementClasses = [];
    }
  }
  
  // Parse siblings if they're strings
  let siblingsBefore = edit.siblings_before || metadata?.surroundingContext?.siblingsBefore || [];
  let siblingsAfter = edit.siblings_after || metadata?.surroundingContext?.siblingsAfter || [];
  
  if (typeof siblingsBefore === 'string') {
    try { siblingsBefore = JSON.parse(siblingsBefore); } catch (e) { siblingsBefore = []; }
  }
  if (typeof siblingsAfter === 'string') {
    try { siblingsAfter = JSON.parse(siblingsAfter); } catch (e) { siblingsAfter = []; }
  }
  
  // Build edit context in the format TextProcessor expects
  const editContext = {
    originalText: edit.original_text,
    newText: edit.new_text,
    projectId: metadata?.projectId || projectId,
    elementContext: {
      elementTag: edit.element_tag || 'div',
      elementClasses: elementClasses,
      elementId: edit.element_id,
      cssSelector: edit.css_selector || '',
      elementPath: edit.css_selector || '',
    },
    surroundingContext: {
      parentText: edit.parent_text,
      siblingsBefore: siblingsBefore,
      siblingsAfter: siblingsAfter,
      ...metadata?.surroundingContext,
    },
    pageContext: {
      pageUrl: edit.page_url || '/',
      pageTitle: edit.page_title || metadata?.pageTitle,
      fullUrl: edit.full_url || metadata?.fullUrl,
    },
    componentContext: metadata?.componentContext || null,
  };
  
  try {
    console.log(`   🤖 Using TextProcessor for intelligent matching...`);
    
    // Use TextProcessor to apply the edit
    const result = await textProcessor.processTextEdit(editContext);
    
    if (result.success) {
      console.log(`   ✅ Applied successfully!`);
      console.log(`      - File: ${result.matchedFilePath}`);
      console.log(`      - Line: ${result.lineNumber}`);
      console.log(`      - Confidence: ${(result.confidence * 100).toFixed(1)}%`);
      
      if (result.alternativeMatches && result.alternativeMatches.length > 0) {
        console.log(`      - Alternative matches found: ${result.alternativeMatches.length}`);
      }
      
      // Update database status with detailed metadata
      await updateEditStatus(edit.id, 'applied', null, {
        matchedFilePath: result.matchedFilePath,
        lineNumber: result.lineNumber,
        confidence: result.confidence,
        matchContext: result.matchContext,
        appliedAt: new Date().toISOString(),
      });
      
      return { 
        success: true, 
        file: result.matchedFilePath,
        line: result.lineNumber,
        confidence: result.confidence
      };
    } else {
      console.log(`   ❌ Failed to apply edit`);
      console.log(`      - Reason: ${result.errorMessage}`);
      console.log(`      - Confidence: ${(result.confidence * 100).toFixed(1)}%`);
      
      if (result.alternativeMatches && result.alternativeMatches.length > 0) {
        console.log(`      - Alternative matches found: ${result.alternativeMatches.length}`);
        result.alternativeMatches.slice(0, 3).forEach((match, i) => {
          console.log(`        ${i + 1}. ${match.filePath}:${match.lineNumber}`);
        });
      }
      
      await updateEditStatus(edit.id, 'failed', result.errorMessage, {
        confidence: result.confidence,
        hasConflicts: result.hasConflicts,
        alternativeMatchesCount: result.alternativeMatches?.length || 0,
      });
      
      return { 
        success: false, 
        error: result.errorMessage,
        confidence: result.confidence
      };
    }
    
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    await updateEditStatus(edit.id, 'failed', error.message);
    return { success: false, error: error.message };
  }
}

async function main() {
  try {
    console.log(`\n📊 Fetching pending edits from database...`);
    
    const pendingEdits = await getPendingEdits();
    
    if (pendingEdits.length === 0) {
      console.log(`✅ No pending edits found for project: ${projectId}`);
      return;
    }
    
    console.log(`📋 Found ${pendingEdits.length} pending edits`);
    console.log(`🤖 Initializing TextProcessor (advanced context-aware matching)...`);
    
    // Initialize TextProcessor with project root
    const textProcessor = new TextProcessor(process.cwd());
    
    let successCount = 0;
    let failureCount = 0;
    const results = [];
    
    // Process each edit
    for (const edit of pendingEdits) {
      const result = await applyEdit(edit, textProcessor);
      results.push({ edit, result });
      
      if (result.success && !result.isDryRun) {
        successCount++;
      } else if (!result.success) {
        failureCount++;
      }
    }
    
    console.log(`\n📊 SUMMARY:`);
    console.log(`   Total edits: ${pendingEdits.length}`);
    console.log(`   ✅ Applied: ${successCount}`);
    console.log(`   ❌ Failed: ${failureCount}`);
    console.log(`   🔄 Skipped (dry run): ${pendingEdits.length - successCount - failureCount}`);
    
    if (successCount > 0 && !isDryRun) {
      console.log(`\n🎉 Successfully applied ${successCount} edits to codebase!`);
      console.log(`📝 Review changes with: git diff`);
      console.log(`💾 Commit changes with: git add . && git commit -m "Apply text edits"`);
    }
    
    if (failureCount > 0) {
      console.log(`\n⚠️  Some edits failed. Check the logs above for details.`);
      console.log(`   You can retry failed edits by running this script again.`);
    }
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the script
main();
