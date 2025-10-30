-- Run this script in MySQL Workbench to create the database objects
-- Adjust the database name as needed, then Run All.

-- 1) Create database (optional)
-- CREATE DATABASE IF NOT EXISTS `bhavish_crm` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
-- USE `bhavish_crm`;

-- 2) Ensure SQL mode and timezone
SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- 3) Tables
CREATE TABLE IF NOT EXISTS `Record` (
  `id` varchar(191) NOT NULL,
  `name` varchar(255) NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `File` (
  `id` varchar(191) NOT NULL,
  `filename` varchar(255) NOT NULL,
  `mimetype` varchar(255) NOT NULL,
  `sizeBytes` int NOT NULL,
  `path` varchar(1024) NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `recordId` varchar(191) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `File_recordId_idx` (`recordId`),
  CONSTRAINT `File_recordId_fkey` FOREIGN KEY (`recordId`) REFERENCES `Record` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 4) Sample data (optional)
-- INSERT INTO `Record` (`id`, `name`) VALUES ('rec_demo_1', 'Demo Record');
-- INSERT INTO `File` (`id`, `filename`, `mimetype`, `sizeBytes`, `path`, `recordId`) VALUES
-- ('file_demo_1', 'example.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 12345, 'public/uploads/example.xlsx', 'rec_demo_1');



