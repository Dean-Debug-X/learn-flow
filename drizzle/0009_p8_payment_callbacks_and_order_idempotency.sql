ALTER TABLE `orders`
  ADD COLUMN `idempotencyKey` varchar(96),
  ADD COLUMN `providerTradeNo` varchar(128),
  ADD COLUMN `paidAmountCents` int NOT NULL DEFAULT 0,
  ADD COLUMN `paymentCallbackAt` timestamp NULL,
  ADD COLUMN `paymentPayload` text,
  ADD COLUMN `benefitsGrantedAt` timestamp NULL,
  ADD COLUMN `benefitsRepairCount` int NOT NULL DEFAULT 0,
  ADD COLUMN `lastBenefitRepairAt` timestamp NULL;

CREATE UNIQUE INDEX `orders_idempotencyKey_unique` ON `orders` (`idempotencyKey`);

CREATE TABLE `payment_callbacks` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `provider` enum('wechat','alipay','custom','manual') NOT NULL DEFAULT 'custom',
  `callbackKey` varchar(191) NOT NULL,
  `eventId` varchar(128),
  `orderNo` varchar(64),
  `relatedOrderId` int,
  `providerTradeNo` varchar(128),
  `amountCents` int NOT NULL DEFAULT 0,
  `status` enum('paid','failed','cancelled','refunded') NOT NULL DEFAULT 'paid',
  `signatureVerified` boolean NOT NULL DEFAULT false,
  `payload` text,
  `resultStatus` enum('received','applied','duplicate','rejected','ignored','error') NOT NULL DEFAULT 'received',
  `resultMessage` text,
  `processedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `payment_callbacks_relatedOrderId_orders_id_fk` FOREIGN KEY (`relatedOrderId`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action,
  CONSTRAINT `payment_callbacks_callbackKey_unique` UNIQUE(`callbackKey`)
);