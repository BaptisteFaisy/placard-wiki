/**
 * Point d'entrée de l'app Forge. Le manifeste (manifest.yml) référence chaque
 * export ci-dessous par `index.<nom>` : toute fonction ajoutée au manifeste
 * doit être exportée ici (garde : tools/validate_manifest.mjs).
 */

export { resolver } from './resolver';
export { contentCreated, contentUpdated, commentCreated } from './triggers';
export { sweepConsumer } from './consumer';
export { incrementalSweep, fullSweep } from './scheduled';
export { purgeRequestHook, publicDemoHook } from './webtriggers';
export {
  scanPage,
  scanSpace,
  listExposedSecrets,
  getFinding,
  traceFingerprint,
  getExposure,
  getCertificate,
  checkText,
  recordRotation,
  requestRedaction,
  applyRedaction,
  dismissFinding,
  openRemediationTicket,
} from './mcp';
