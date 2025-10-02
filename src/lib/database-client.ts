import { Pool } from 'pg';
import { PuppeteerTextEdit } from './types/database-types';

export class TextEditsDatabase {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }

  async saveEdit(data: PuppeteerTextEdit): Promise<string> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO inline_edits (
          original_text, 
          new_text, 
          status, 
          confidence, 
          element_context_element_tag,
          element_context_element_id,
          element_context_css_selector,
          page_context_page_url,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
        RETURNING id`,
        [
          data.originalText,
          data.newText,
          data.status,
          data.confidence || null,
          data.elementContext.elementTag,
          data.elementContext.elementId || null,
          data.elementContext.cssSelector || null,
          data.pageContext.pageUrl,
          JSON.stringify({
            projectId: data.projectId,

            fullElementContext: data.elementContext,
            fullSurroundingContext: data.surroundingContext,
            fullPageContext: data.pageContext,
            fullComponentContext: data.componentContext,
            ...data.metadata || {}
          }),
        ]
      );
      return result.rows[0].id.toString();
    } finally {
      client.release();
    }
  }

  async getOriginalText(context: {
    projectId: string;
    pageUrl: string;
    cssSelector?: string;
    elementId?: string;
    elementTag?: string;
  }): Promise<string | null> {
    const client = await this.pool.connect();
    try {
      
      let query = `
        SELECT original_text, element_context_css_selector, element_context_element_id, 
               element_context_element_tag
        FROM inline_edits 
        WHERE page_context_page_url = $1 
        AND metadata->>'projectId' = $2`;
      
      const params: unknown[] = [context.pageUrl, context.projectId];
      
      query += ` ORDER BY created_at DESC`;

      const result = await client.query(query, params);

      if (result.rows.length === 0) {
        return null;
      }


      if (result.rows.length > 1 && context.cssSelector) {
       
        const cleanSelector = context.cssSelector.replace(/\[data-deep-text-id="[^"]*"\]/g, '');
        
        const filteredEdits = result.rows.filter(edit => {
          const editCleanSelector = edit.element_context_css_selector?.replace(/\[data-deep-text-id="[^"]*"\]/g, '') || '';
          if (editCleanSelector === cleanSelector) return true;

      
          if (context.elementId && edit.element_context_element_id === context.elementId) return true;

       
          if (context.elementTag && edit.element_context_element_tag === context.elementTag) return true;

          return false;
        });

        if (filteredEdits.length > 0) {
          return filteredEdits[0].original_text;
        }
      }

 
      return result.rows[0].original_text;
    } finally {
      client.release();
    }
  }

  async updateEditStatus(
    editId: string, 
    status: PuppeteerTextEdit['status'], 
    processingResult?: Record<string, unknown>
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      if (processingResult) {
        
        await client.query(
          `UPDATE inline_edits 
           SET status = $1, 
               processing_result_matched_file_path = $2,
               processing_result_line_number = $3,
               processing_result_error_message = $4,
               updated_at = NOW() 
           WHERE id = $5`,
          [
            status,
            processingResult.matchedFilePath || null,
            processingResult.lineNumber || null,
            processingResult.errorMessage || null,
            editId
          ]
        );
      } else {
        
        await client.query(
          `UPDATE inline_edits 
           SET status = $1, updated_at = NOW() 
           WHERE id = $2`,
          [status, editId]
        );
      }
    } finally {
      client.release();
    }
  }

  async getEditHistory(
    projectId: string, 
    pageUrl?: string, 
    limit: number = 50
  ): Promise<PuppeteerTextEdit[]> {
    const client = await this.pool.connect();
    try {
      let query = `
        SELECT * FROM inline_edits 
        WHERE metadata->>'projectId' = $1`;
      const params: unknown[] = [projectId];

      if (pageUrl) {
        query += ` AND page_context_page_url = $${params.length + 1}`;
        params.push(pageUrl);
      }

      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await client.query(query, params);
      return result.rows.map(row => this.mapRowToTextEdit(row));
    } finally {
      client.release();
    }
  }

  private mapRowToTextEdit(row: Record<string, unknown>): PuppeteerTextEdit {
    const metadata = row.metadata ? JSON.parse(row.metadata as string) : {};
    
    const fullElementContext = metadata.fullElementContext || {};
    const fullSurroundingContext = metadata.fullSurroundingContext || {};
    const fullPageContext = metadata.fullPageContext || {};
    const fullComponentContext = metadata.fullComponentContext || {};
    
    return {
      id: row.id as string,
      projectId: metadata.projectId || 'unknown',
      originalText: row.original_text as string,
      newText: row.new_text as string,
      status: row.status as PuppeteerTextEdit['status'],
      confidence: row.confidence as number,
      elementContext: {
        elementTag: fullElementContext.elementTag || (row.element_context_element_tag as string),
        elementId: fullElementContext.elementId || (row.element_context_element_id as string),
        cssSelector: fullElementContext.cssSelector || (row.element_context_css_selector as string),
        elementPath: fullElementContext.elementPath || (row.element_context_css_selector as string),
        elementClasses: fullElementContext.elementClasses || [],
        heroPageElementId: fullElementContext.heroPageElementId,
      },
      surroundingContext: {
        parentText: fullSurroundingContext.parentText,
        siblingsBefore: fullSurroundingContext.siblings?.before || fullSurroundingContext.siblingsBefore || [],
        siblingsAfter: fullSurroundingContext.siblings?.after || fullSurroundingContext.siblingsAfter || [],
        nearbyUniqueText: fullSurroundingContext.nearbyUniqueText,
        ancestorContext: fullSurroundingContext.ancestorContext || [],
        elementTextIndex: fullSurroundingContext.elementTextIndex,
        precedingTextNodes: fullSurroundingContext.precedingTextNodes || [],
        followingTextNodes: fullSurroundingContext.followingTextNodes || [],
        uniqueIdentifiers: fullSurroundingContext.uniqueIdentifiers || [],
        detailedPath: fullSurroundingContext.detailedPath || [],
      },
      pageContext: {
        pageUrl: fullPageContext.pageUrl || (row.page_context_page_url as string),
        pageTitle: fullPageContext.pageTitle || 'Unknown',
        fullUrl: fullPageContext.fullUrl || fullPageContext.pageUrl || (row.page_context_page_url as string),
      },
      componentContext: fullComponentContext.componentName ? {
        componentName: fullComponentContext.componentName,
        propName: fullComponentContext.propName,
        componentProps: fullComponentContext.componentProps || {},
      } : undefined,
      metadata: metadata,
      processingResult: {
        matchedFilePath: row.processing_result_matched_file_path as string,
        lineNumber: row.processing_result_line_number as number,
        errorMessage: row.processing_result_error_message as string,
        matchContext: (row.processing_result_match_context as string) || 'Context retrieved from metadata',
      },
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}


let dbInstance: TextEditsDatabase | null = null;

export function getDatabase(): TextEditsDatabase {
  if (!dbInstance) {
    dbInstance = new TextEditsDatabase();
  }
  return dbInstance;
}