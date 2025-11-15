# BhavishCRM - AI-Powered Document Processing & Stock Management

A lightweight CRM/ERP system with AI-powered document extraction for managing records, products, and stock inventory.

## Features

- 🤖 **AI Document Extraction**: Automatically extract product information from PDF, Excel, and Word documents using OpenAI
- 📦 **Stock Management**: Track products with stock status (In Stock, Low Stock, Out of Stock)
- 📄 **Document Management**: Upload and organize documents (PDF, XLS, XLSX, DOC, DOCX)
- 🔍 **Product Search**: Search products by SKU, name, brand, or group
- 📊 **Dashboard**: View statistics and stock status at a glance

## Prerequisites

- Node.js 18+ 
- MySQL database
- OpenAI API key

## Installation

1. **Clone the repository and install dependencies:**

```bash
cd crm-app
npm install
```

2. **Set up environment variables:**

Create a `.env` file in the `crm-app` directory:

```env
# Database
DATABASE_URL="mysql://user:password@localhost:3306/bhavish_crm"

# OpenAI API Key for AI document extraction
OPENAI_API_KEY="sk-your-openai-api-key-here"

# Optional: Specify which OpenAI model to use (default: gpt-4o-mini)
OPENAI_MODEL="gpt-4o-mini"

# Optional: Upload directory (default: public/uploads)
UPLOAD_DIR="public/uploads"
```

3. **Set up the database:**

```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate
```

4. **Start the development server:**

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## How It Works

### AI Document Processing

1. **Upload Documents**: When you upload documents (PDF, Excel, Word), they are automatically queued for AI processing
2. **AI Extraction**: The system uses OpenAI to extract product information including:
   - SKU/Product Code
   - Product Name
   - Brand
   - Group/Category
   - Quantity/Stock
   - Price (if available)
   - Description (if available)
3. **Auto-Save**: Extracted products are automatically saved to the database
4. **Stock Tracking**: Products with quantities are tracked with stock status

### Stock Status

Products are automatically categorized by stock status:
- **In Stock**: Quantity > minimum stock threshold
- **Low Stock**: Quantity ≤ minimum stock threshold but > 0
- **Out of Stock**: Quantity = 0

Default minimum stock threshold is 10 units (configurable per product).

## API Endpoints

- `POST /api/upload` - Upload files and create records (auto-processes with AI)
- `POST /api/import/stock` - Manual stock import from Excel
- `POST /api/files/[id]/process` - Manually trigger AI processing for a file
- `GET /api/files/[id]/extraction-status` - Get extraction status for a file
- `GET /api/files/[id]` - Download/view a file

## Manual Processing

If a file fails automatic processing or you want to reprocess it:

1. Go to the Records page
2. Click on a record to view files
3. Check the extraction status
4. Use the API endpoint `/api/files/[id]/process` to manually trigger processing

## Supported File Types

- **PDF**: Full text extraction
- **Excel**: XLS, XLSX - Table data extraction
- **Word**: DOCX - Text extraction (DOC format not fully supported)

## Database Schema

- **Record**: Document records with metadata
- **File**: Uploaded files with extraction status
- **Product**: Product information (SKU, name, brand, group)
- **Stock**: Stock quantities per product with minimum thresholds

## Development

```bash
# Development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Database migrations
npm run prisma:migrate
```

## Notes

- AI processing happens asynchronously in the background
- Large documents may take time to process
- Ensure you have sufficient OpenAI API credits
- The system uses `gpt-4o-mini` by default for cost efficiency (configurable)

## License

Private project



