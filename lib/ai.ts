import OpenAI from 'openai';
import { readFileSync } from 'fs';
import * as XLSX from 'xlsx';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

export type ExtractedProduct = {
  sku: string;
  name: string;
  brand?: string;
  group?: string;
  quantity?: number;
  price?: number;
  description?: string;
  [key: string]: any; // Allow additional fields
};

export type ExtractionResult = {
  products: ExtractedProduct[];
  metadata?: {
    documentType?: string;
    totalItems?: number;
    date?: string;
    [key: string]: any;
  };
};

/**
 * Extract text content from different file types
 */
async function extractTextFromFile(filePath: string, mimetype: string): Promise<string> {
  if (mimetype.includes('pdf')) {
    const dataBuffer = readFileSync(filePath);
    const pdfData = await pdf(dataBuffer);
    return pdfData.text;
  } else if (mimetype.includes('excel') || mimetype.includes('spreadsheet') || 
             filePath.endsWith('.xls') || filePath.endsWith('.xlsx')) {
    const buf = readFileSync(filePath);
    const wb = XLSX.read(buf, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet);
    return JSON.stringify(json, null, 2);
  } else if (mimetype.includes('word') || filePath.endsWith('.docx')) {
    // Extract text from .docx files using mammoth
    const dataBuffer = readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer: dataBuffer });
    return result.value;
  } else if (filePath.endsWith('.doc')) {
    // .doc files are binary format, harder to parse without additional libraries
    // For now, return a message - consider converting to .docx or using a library like antiword
    throw new Error('Legacy .doc format not fully supported. Please convert to .docx format.');
  } else {
    // Try to read as text
    return readFileSync(filePath, 'utf-8');
  }
}

/**
 * Use AI to extract product information from document text
 */
export async function extractProductsWithAI(filePath: string, mimetype: string): Promise<ExtractionResult> {
  try {
    // Extract text content from file
    const documentText = await extractTextFromFile(filePath, mimetype);
    
    if (!documentText || documentText.trim().length === 0) {
      throw new Error('No text content found in document');
    }

    // Truncate if too long (OpenAI has token limits)
    const maxLength = 50000; // Approximate character limit
    const truncatedText = documentText.length > maxLength 
      ? documentText.substring(0, maxLength) + '\n... [truncated]'
      : documentText;

    // Create AI prompt for extraction
    const prompt = `You are a data extraction assistant. Extract product information from the following document.
    
Extract all products with the following information:
- SKU/Product Code (required)
- Product Name (required)
- Brand (if available)
- Group/Category (if available)
- Quantity/Stock (if available)
- Price (if available)
- Description (if available)
- Any other relevant product information

Return the data as a JSON object with this structure:
{
  "products": [
    {
      "sku": "string (required)",
      "name": "string (required)",
      "brand": "string (optional)",
      "group": "string (optional)",
      "quantity": number (optional),
      "price": number (optional),
      "description": "string (optional)"
    }
  ],
  "metadata": {
    "documentType": "string",
    "totalItems": number,
    "date": "string (if found)"
  }
}

Document content:
${truncatedText}

Return ONLY valid JSON, no additional text or explanation.`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that extracts structured product data from documents. Always return valid JSON only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1, // Low temperature for consistent extraction
      response_format: { type: 'json_object' }
    });

    const responseText = completion.choices[0]?.message?.content || '{}';
    const result = JSON.parse(responseText) as ExtractionResult;

    // Validate and clean the extracted data
    if (!result.products || !Array.isArray(result.products)) {
      result.products = [];
    }

    // Clean and validate each product
    result.products = result.products
      .filter(p => p.sku && p.name) // Only keep products with required fields
      .map(p => ({
        sku: String(p.sku || '').trim(),
        name: String(p.name || '').trim(),
        brand: p.brand ? String(p.brand).trim() : undefined,
        group: p.group ? String(p.group).trim() : undefined,
        quantity: p.quantity ? Number(p.quantity) || 0 : undefined,
        price: p.price ? Number(p.price) || undefined : undefined,
        description: p.description ? String(p.description).trim() : undefined,
      }))
      .filter(p => p.sku && p.name); // Final validation

    return result;
  } catch (error: any) {
    throw new Error(`AI extraction failed: ${error.message}`);
  }
}

