// Script to add missing minStockThreshold column
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixDatabase() {
  try {
    console.log('Adding minStockThreshold column to Product table...');
    
    // Check if column exists first
    const result = await prisma.$queryRaw`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'Product' 
      AND COLUMN_NAME = 'minStockThreshold'
    `;
    
    if (result.length > 0) {
      console.log('Column already exists!');
    } else {
      // Add the column
      await prisma.$executeRaw`
        ALTER TABLE \`Product\` 
        ADD COLUMN \`minStockThreshold\` INT NOT NULL DEFAULT 10
      `;
      console.log('✅ Column added successfully!');
    }
    
    // Also check and add missing columns to File table if needed
    const fileColumns = await prisma.$queryRaw`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'File'
    `;
    
    const hasExtractionStatus = fileColumns.some(c => c.COLUMN_NAME === 'extractionStatus');
    const hasExtractedData = fileColumns.some(c => c.COLUMN_NAME === 'extractedData');
    const hasExtractionError = fileColumns.some(c => c.COLUMN_NAME === 'extractionError');
    
    if (!hasExtractionStatus) {
      await prisma.$executeRaw`
        ALTER TABLE \`File\` 
        ADD COLUMN \`extractionStatus\` VARCHAR(191) NOT NULL DEFAULT 'PENDING'
      `;
      console.log('✅ Added extractionStatus column');
    }
    
    if (!hasExtractedData) {
      await prisma.$executeRaw`
        ALTER TABLE \`File\` 
        ADD COLUMN \`extractedData\` TEXT NULL
      `;
      console.log('✅ Added extractedData column');
    }
    
    if (!hasExtractionError) {
      await prisma.$executeRaw`
        ALTER TABLE \`File\` 
        ADD COLUMN \`extractionError\` TEXT NULL
      `;
      console.log('✅ Added extractionError column');
    }
    
    // Check Stock table for minStock column
    const stockColumns = await prisma.$queryRaw`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'Stock'
    `;
    
    const hasMinStock = stockColumns.some(c => c.COLUMN_NAME === 'minStock');
    if (!hasMinStock) {
      await prisma.$executeRaw`
        ALTER TABLE \`Stock\` 
        ADD COLUMN \`minStock\` INT NOT NULL DEFAULT 0
      `;
      console.log('✅ Added minStock column to Stock table');
    }
    
    console.log('\n✅ Database schema updated successfully!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

fixDatabase();

