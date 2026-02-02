import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { processReport } from './functions/process-policy-report/resource';

const backend = defineBackend({
  auth,
  data,
  storage,
  processReport
});
