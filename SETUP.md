# Setup Instructions

## Quick Start

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Create `.env` file:**
   ```env
   DATABASE_URL="mysql://user:password@localhost:3306/bhavish_crm"
   OPENAI_API_KEY="sk-your-key-here"
   ```

3. **Run Database Migrations:**
   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   ```

4. **Start Development Server:**
   ```bash
   npm run dev
   ```

## Database Migration

After updating the Prisma schema, you need to create and apply a migration:

```bash
# Create a new migration
npx prisma migrate dev --name add_ai_extraction

# Or if you want to reset the database (WARNING: deletes all data)
npx prisma migrate reset
```

## OpenAI API Key Setup

1. Go to https://platform.openai.com/api-keys
2. Create a new API key
3. Copy the key and add it to your `.env` file as `OPENAI_API_KEY`
4. Make sure you have credits in your OpenAI account

## Testing AI Extraction

1. Upload a document (PDF, Excel, or Word) through the Records page
2. The file will automatically be processed in the background
3. Check the extraction status in the Records table
4. View extracted products in the Products page

## Troubleshooting

### AI Processing Not Working
- Check that `OPENAI_API_KEY` is set in `.env`
- Verify you have OpenAI API credits
- Check server logs for error messages

### Database Connection Issues
- Verify `DATABASE_URL` is correct
- Ensure MySQL is running
- Check database credentials

### File Upload Issues
- Ensure `public/uploads` directory exists and is writable
- Check file size limits (default: 20MB)
- Verify file types are supported



