import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { registerDestructiveConcurrencyGuard } from "../destructiveConcurrency.js";
import { registerCaseRoutes } from "./cases.js";
import { registerDefinitionRoutes } from "./definitions.js";
import { registerExcelRoutes } from "./excel.js";
import { registerRunRoutes } from "./runs.js";
import { registerEvidenceRoutes } from "./evidence.js";
import { registerEvidenceDerivedRoutes } from "./evidenceDerived.js";
import { registerExportRoutes } from "./exports.js";
import { registerScenarioEditorRoutes } from "./scenarioEditor.js";
import { registerOperationRoutes } from "./operations.js";

export async function registerFeatureRoutes(app: FastifyInstance, db: Database, config: AppConfig): Promise<void> {
  await app.register(multipart, {
    limits: {
      fileSize: 100 * 1024 * 1024,
      files: 1,
      fields: 1000,
      parts: 1001,
    },
  });
  registerDestructiveConcurrencyGuard(app, db, config);
  await registerCaseRoutes(app, db, config);
  await registerDefinitionRoutes(app, db, config);
  await registerScenarioEditorRoutes(app, db, config);
  await registerExcelRoutes(app, db, config);
  await registerRunRoutes(app, db, config);
  await registerEvidenceRoutes(app, db, config);
  await registerEvidenceDerivedRoutes(app, db, config);
  await registerExportRoutes(app, db, config);
  await registerOperationRoutes(app, db, config);
}

