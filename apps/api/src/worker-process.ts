import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });

import './workers/index.js';

console.log('SmartLoad worker process started — inventory, POD, tally, and notification queues active');
