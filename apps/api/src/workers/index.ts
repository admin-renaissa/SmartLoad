import './inventory-deduction.worker.js';
import './pod-creation.worker.js';
import './tally-sync.worker.js';
import { startNotificationWorker } from './notification.worker.js';

startNotificationWorker();
