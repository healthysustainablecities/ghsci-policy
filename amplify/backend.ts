import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import {processReportFunctionHandler} from './functions/process-policy-report/resource'
// import {createCleanupPolicyFilesFunctionHandler} from './functions/cleanup-policy-files/resource'

const backend = defineBackend({
  auth,
  data,
  storage,
  // createCleanupPolicyFilesFunctionHandler,
  processReportFunctionHandler,

});
