
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

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

async function discoverFilesWithPuppeteer(editContext) {
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // Get the page URL from context
    const pageUrl = editContext.page_context?.page_url || 'http://localhost:3000';
    console.log(`🌐 Loading page: ${pageUrl}`);
    
    await page.goto(pageUrl, { waitUntil: 'networkidle0' });
    
    // Get element information from context
    const elementTag = editContext.element_context?.element_tag;
    const elementId = editContext.element_context?.element_id;
    const cssSelector = editContext.element_context?.css_selector;
    
    let targetElement = null;
    
    // Try to find the specific element using context
    if (cssSelector) {
      try {
        targetElement = await page.$(cssSelector);
        console.log(`🎯 Found element with CSS selector: ${cssSelector}`);
      } catch (error) {
        console.log(`⚠️  Could not find element with CSS selector: ${cssSelector}`);
      }
    }
    
    if (!targetElement && elementId) {
      try {
        targetElement = await page.$(`#${elementId}`);
        console.log(`🎯 Found element with ID: ${elementId}`);
      } catch (error) {
        console.log(`⚠️  Could not find element with ID: ${elementId}`);
      }
    }
    
    if (!targetElement && elementTag) {
      try {
        targetElement = await page.$(elementTag);
        console.log(`🎯 Found element with tag: ${elementTag}`);
      } catch (error) {
        console.log(`⚠️  Could not find element with tag: ${elementTag}`);
      }
    }
    
    // If we found the element, get its file path information
    if (targetElement) {
      const elementInfo = await page.evaluate((el) => {
        return {
          tagName: el.tagName,
          id: el.id,
          className: el.className,
          textContent: el.textContent?.trim(),
          innerHTML: el.innerHTML,
          outerHTML: el.outerHTML
        };
      }, targetElement);
      
      console.log(`📄 Element info:`, elementInfo);
      
      // Try to determine which file this element might be in
      const possibleFiles = await determineFileFromElement(elementInfo, pageUrl);
      return possibleFiles;
    }
    
    return [];
    
  } finally {
    await browser.close();
  }
}

async function determineFileFromElement(elementInfo, pageUrl) {
  const possibleFiles = [];
  const projectRoot = process.cwd();
  
  // Common file extensions to check
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.txt', '.html', '.css', '.scss'];
  
  // Search in common directories
  const searchDirs = [
    path.join(projectRoot, 'src'),
    path.join(projectRoot, 'public'),
    path.join(projectRoot, 'components'),
    path.join(projectRoot, 'app'),
    path.join(projectRoot, 'pages'),
    projectRoot
  ];
  
  // Function to search for files containing the element text
  function searchFiles(dir) {
    if (!fs.existsSync(dir)) return;
    
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && !item.startsWith('.') && !['node_modules', 'dist', 'build', '.next'].includes(item)) {
          searchFiles(fullPath);
        } else if (stat.isFile() && extensions.some(ext => item.endsWith(ext))) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            
            // Check if this file contains the element's text content
            if (elementInfo.textContent && content.includes(elementInfo.textContent)) {
              possibleFiles.push(fullPath);
            }
            // Also check for the element's HTML structure
            else if (elementInfo.innerHTML && content.includes(elementInfo.innerHTML)) {
              possibleFiles.push(fullPath);
            }
            // Check for element ID or class references
            else if (elementInfo.id && content.includes(elementInfo.id)) {
              possibleFiles.push(fullPath);
            }
            else if (elementInfo.className && content.includes(elementInfo.className)) {
              possibleFiles.push(fullPath);
            }
          } catch (error) {
            // Skip files that can't be read
          }
        }
      }
    } catch (error) {
      // Skip directories that can't be read
    }
  }
  
  // Search all directories
  searchDirs.forEach(dir => searchFiles(dir));
  
  return possibleFiles;
}

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
        page_context_page_url as page_url,
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

async function updateEditStatus(editId, status, errorMessage = null) {
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
    
    const metadata = errorMessage ? { errorMessage } : {};
    await client.query(query, [editId, status, JSON.stringify(metadata)]);
  } finally {
    client.release();
  }
}

async function findAndReplaceInFiles(originalText, newText, editContext = null) {
  let files = [];
  
  // Use Puppeteer for intelligent file discovery if we have context
  if (editContext && (editContext.element_context || editContext.page_context)) {
    console.log(`🤖 Using Puppeteer for intelligent file discovery...`);
    try {
      files = await discoverFilesWithPuppeteer(editContext);
      console.log(`🎯 Puppeteer found ${files.length} potential files`);
    } catch (error) {
      console.log(`⚠️  Puppeteer discovery failed: ${error.message}`);
      console.log(`🔄 Falling back to traditional file search...`);
    }
  }
  
  // Fallback to traditional search if Puppeteer didn't find files or failed
  if (files.length === 0) {
    console.log(`🔍 Using traditional file search...`);
    
    // Find all supported file types
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.txt', '.html', '.css', '.scss'];
    
    // Search in multiple directories for comprehensive coverage
    const searchDirs = [
      path.join(process.cwd(), 'src'),
      path.join(process.cwd(), 'public'),
      path.join(process.cwd(), 'components'),
      path.join(process.cwd(), 'app'),
      path.join(process.cwd(), 'pages'),
      process.cwd() // Root directory
    ];
    
    function findFiles(dir) {
      if (!fs.existsSync(dir)) return;
      
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules' && item !== 'dist' && item !== 'build') {
          findFiles(fullPath);
        } else if (stat.isFile() && extensions.some(ext => item.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    }
    
    // Search in all directories
    searchDirs.forEach(dir => findFiles(dir));
  }
  
  const results = [];
  
  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      
      if (content.includes(originalText)) {
        let newContent = content;
        let changeCount = 0;
        
        // Use context-aware replacement if available
        if (editContext && editContext.element_context) {
          // Try to find the specific element context first
          const elementTag = editContext.element_context.element_tag;
          const elementId = editContext.element_context.element_id;
          const cssSelector = editContext.element_context.css_selector;
          
          // If we have element context, try to be more precise
          if (elementTag || elementId || cssSelector) {
            console.log(`   🎯 Using element context: ${elementTag || 'unknown'} ${elementId || ''} ${cssSelector || ''}`);
          }
        }
        
        // Perform the replacement with proper escaping
        const escapedText = originalText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedText, 'g');
        newContent = content.replace(regex, newText);
        changeCount = (content.match(regex) || []).length;
        
        if (!isDryRun) {
          fs.writeFileSync(filePath, newContent, 'utf8');
        }
        
        results.push({
          filePath: path.relative(process.cwd(), filePath),
          success: true,
          changes: changeCount
        });
      }
    } catch (error) {
      results.push({
        filePath: path.relative(process.cwd(), filePath),
        success: false,
        error: error.message
      });
    }
  }
  
  return results;
}

async function applyEdit(edit) {
  console.log(`\n📝 Processing edit ${edit.id} (Status: ${edit.status}):`);
  console.log(`   Original: "${edit.original_text}"`);
  console.log(`   New: "${edit.new_text}"`);
  
  console.log(`   🔍 Context data:`, {
    element_tag: edit.element_tag,
    element_id: edit.element_id,
    css_selector: edit.css_selector,
    page_url: edit.page_url
  });
  
  if (isDryRun) {
    console.log(`   🔍 DRY RUN: Would apply this edit`);
    return { success: true, isDryRun: true };
  }
  
  const editContext = {
    element_context: {
      element_tag: edit.element_tag,
      element_id: edit.element_id,
      css_selector: edit.css_selector
    },
    page_context: {
      page_url: edit.page_url
    },
    metadata: edit.metadata
  };
  
  try {
    const results = await findAndReplaceInFiles(edit.original_text, edit.new_text, editContext);
    
    const successfulFiles = results.filter(r => r.success);
    const failedFiles = results.filter(r => !r.success);
    
    if (successfulFiles.length > 0) {
      console.log(`   ✅ Applied to ${successfulFiles.length} files`);
      successfulFiles.forEach(file => {
        console.log(`      - ${file.filePath} (${file.changes} changes)`);
      });
      
      // Update database status
      await updateEditStatus(edit.id, 'applied');
      
      return { success: true, files: successfulFiles };
    } else {
      console.log(`   ❌ No files found containing the text`);
      await updateEditStatus(edit.id, 'failed', 'Text not found in codebase');
      return { success: false, error: 'Text not found' };
    }
    
    if (failedFiles.length > 0) {
      console.log(`   ⚠️  Failed to update ${failedFiles.length} files`);
      failedFiles.forEach(file => {
        console.log(`      - ${file.filePath}: ${file.error}`);
      });
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
    
    console.log(`📋 Found ${pendingEdits.length} pending edits:`);
    
    let successCount = 0;
    let failureCount = 0;
    const results = [];
    
    // Process each edit
    for (const edit of pendingEdits) {
      const result = await applyEdit(edit);
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
    }
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the script
main();
