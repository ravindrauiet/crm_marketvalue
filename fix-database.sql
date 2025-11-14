-- Run this SQL in MySQL Workbench to fix the database schema
-- Make sure you're connected to the 'bhavish_crm' database

USE bhavish_crm;

-- Add minStockThreshold column to Product table
-- (Run this even if column exists - it will show an error but won't break anything)
ALTER TABLE `Product` 
ADD COLUMN `minStockThreshold` INT NOT NULL DEFAULT 10;

-- Add missing columns to File table
ALTER TABLE `File` 
ADD COLUMN `extractionStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING';

ALTER TABLE `File` 
ADD COLUMN `extractedData` TEXT NULL;

ALTER TABLE `File` 
ADD COLUMN `extractionError` TEXT NULL;

-- Add minStock column to Stock table
ALTER TABLE `Stock` 
ADD COLUMN `minStock` INT NOT NULL DEFAULT 0;

-- Verify the changes
SELECT 'Database schema updated successfully!' AS Status;

