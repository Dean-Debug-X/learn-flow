CREATE TABLE `admin_risk_playbooks` (
  `id` int AUTO_INCREMENT NOT NULL,
  `code` varchar(64) NOT NULL,
  `name` varchar(128) NOT NULL,
  `triggerSeverity` enum('all','warn','critical') NOT NULL DEFAULT 'all',
  `actionType` varchar(96),
  `resourceType` varchar(64),
  `summary` text,
  `checklist` text,
  `enabled` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `admin_risk_playbooks_id` PRIMARY KEY(`id`),
  CONSTRAINT `admin_risk_playbooks_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
ALTER TABLE `admin_risk_incidents` ADD COLUMN `playbookId` int;
--> statement-breakpoint
CREATE TABLE `admin_risk_automation_rules` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(128) NOT NULL,
  `triggerSeverity` enum('all','warn','critical') NOT NULL DEFAULT 'all',
  `actionType` varchar(96),
  `resourceType` varchar(64),
  `minRiskScore` int NOT NULL DEFAULT 0,
  `playbookId` int,
  `autoAcknowledge` boolean NOT NULL DEFAULT false,
  `autoEscalate` boolean NOT NULL DEFAULT false,
  `executionNote` text,
  `enabled` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `admin_risk_automation_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `admin_risk_rule_executions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `incidentId` int NOT NULL,
  `ruleId` int NOT NULL,
  `playbookId` int,
  `status` enum('matched','executed','skipped','failed') NOT NULL DEFAULT 'matched',
  `executionSummary` text,
  `payload` text,
  `executedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `admin_risk_rule_executions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `admin_risk_incidents` ADD CONSTRAINT `admin_risk_incidents_playbookId_admin_risk_playbooks_id_fk` FOREIGN KEY (`playbookId`) REFERENCES `admin_risk_playbooks`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `admin_risk_automation_rules` ADD CONSTRAINT `admin_risk_automation_rules_playbookId_admin_risk_playbooks_id_fk` FOREIGN KEY (`playbookId`) REFERENCES `admin_risk_playbooks`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `admin_risk_rule_executions` ADD CONSTRAINT `admin_risk_rule_executions_incidentId_admin_risk_incidents_id_fk` FOREIGN KEY (`incidentId`) REFERENCES `admin_risk_incidents`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `admin_risk_rule_executions` ADD CONSTRAINT `admin_risk_rule_executions_ruleId_admin_risk_automation_rules_id_fk` FOREIGN KEY (`ruleId`) REFERENCES `admin_risk_automation_rules`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `admin_risk_rule_executions` ADD CONSTRAINT `admin_risk_rule_executions_playbookId_admin_risk_playbooks_id_fk` FOREIGN KEY (`playbookId`) REFERENCES `admin_risk_playbooks`(`id`) ON DELETE no action ON UPDATE no action;
