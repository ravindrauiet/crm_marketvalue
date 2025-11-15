-- Run this SQL script in MySQL Workbench to add CRM features
-- Make sure you're connected to the 'bhavish_crm' database

USE bhavish_crm;

-- 1. Add new columns to Product table
ALTER TABLE `Product` 
ADD COLUMN `description` TEXT NULL AFTER `group`;

ALTER TABLE `Product` 
ADD COLUMN `price` DOUBLE NULL AFTER `description`;

ALTER TABLE `Product` 
ADD COLUMN `cost` DOUBLE NULL AFTER `price`;

ALTER TABLE `Product` 
ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) AFTER `createdAt`;

-- Add indexes for better performance
ALTER TABLE `Product` 
ADD INDEX `Product_brand_idx` (`brand`);

ALTER TABLE `Product` 
ADD INDEX `Product_group_idx` (`group`);

-- 2. Create Customer table
CREATE TABLE IF NOT EXISTS `Customer` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `company` VARCHAR(255) NULL,
  `email` VARCHAR(255) NULL,
  `phone` VARCHAR(255) NULL,
  `address` TEXT NULL,
  `city` VARCHAR(255) NULL,
  `state` VARCHAR(255) NULL,
  `zipCode` VARCHAR(255) NULL,
  `country` VARCHAR(255) NULL,
  `taxId` VARCHAR(255) NULL,
  `notes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `Customer_name_idx` (`name`),
  INDEX `Customer_email_idx` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 3. Create Order table
CREATE TABLE IF NOT EXISTS `Order` (
  `id` VARCHAR(191) NOT NULL,
  `orderNumber` VARCHAR(255) NOT NULL,
  `type` VARCHAR(191) NOT NULL,
  `customerId` VARCHAR(191) NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
  `orderDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deliveryDate` DATETIME(3) NULL,
  `totalAmount` DOUBLE NOT NULL DEFAULT 0,
  `notes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `Order_orderNumber_key` (`orderNumber`),
  INDEX `Order_orderNumber_idx` (`orderNumber`),
  INDEX `Order_customerId_idx` (`customerId`),
  INDEX `Order_status_idx` (`status`),
  INDEX `Order_orderDate_idx` (`orderDate`),
  CONSTRAINT `Order_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 4. Create OrderItem table
CREATE TABLE IF NOT EXISTS `OrderItem` (
  `id` VARCHAR(191) NOT NULL,
  `orderId` VARCHAR(191) NOT NULL,
  `productId` VARCHAR(191) NOT NULL,
  `quantity` INT NOT NULL,
  `unitPrice` DOUBLE NOT NULL,
  `totalPrice` DOUBLE NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `OrderItem_orderId_idx` (`orderId`),
  INDEX `OrderItem_productId_idx` (`productId`),
  CONSTRAINT `OrderItem_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `OrderItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 5. Create StockTransaction table
CREATE TABLE IF NOT EXISTS `StockTransaction` (
  `id` VARCHAR(191) NOT NULL,
  `productId` VARCHAR(191) NOT NULL,
  `type` VARCHAR(191) NOT NULL,
  `quantity` INT NOT NULL,
  `previousQty` INT NOT NULL,
  `newQty` INT NOT NULL,
  `reason` VARCHAR(255) NULL,
  `reference` VARCHAR(255) NULL,
  `notes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `StockTransaction_productId_idx` (`productId`),
  INDEX `StockTransaction_type_idx` (`type`),
  INDEX `StockTransaction_createdAt_idx` (`createdAt`),
  CONSTRAINT `StockTransaction_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 6. Create Notification table
CREATE TABLE IF NOT EXISTS `Notification` (
  `id` VARCHAR(191) NOT NULL,
  `type` VARCHAR(191) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `message` TEXT NOT NULL,
  `read` BOOLEAN NOT NULL DEFAULT FALSE,
  `link` VARCHAR(255) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `Notification_read_idx` (`read`),
  INDEX `Notification_createdAt_idx` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Verify the changes
SELECT 'Database schema updated successfully!' AS Status;


