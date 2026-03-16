import { type ClientSchema, a, defineData } from "@aws-amplify/backend";
import { triggerProcessing } from '../functions/trigger-processing/resource';

/*== STEP 1 ===============================================================
The section below creates a Todo database table with a "content" field. Try
adding a new "isDone" field as a boolean. The authorization rule below
specifies that any user authenticated via an API key can "create", "read",
"update", and "delete" any "Todo" records.
=========================================================================*/
const schema = a.schema({
  PolicyReport: a
    .model({
      fileName: a.string().required(),
      fileKey: a.string(), // S3 key for uploaded file
      status: a.enum(['UPLOADED', 'PROCESSING', 'COMPLETED', 'FAILED']),
      pdfUrl: a.string(),
      reportTitle: a.string(),
      collectionDetails: a.string(),
      policyChecklist: a.string(),
      reportConfig: a.json(), // Custom report configuration (JSON)
      initialReportConfig: a.json(), // Original parsed config from Excel (for revert)
      policyData: a.json(), // Policy data from policy_data_setup() for viewing
      fileSize: a.integer().required(),
      errorMessage: a.string(),
      uploadedAt: a.datetime(),
      processedAt: a.datetime(),
      completedAt: a.datetime(),
    })
    .authorization((allow) => [
      allow.owner()
    ]),

  triggerReportProcessing: a
    .mutation()
    .arguments({
      fileKey: a.string().required(),
      reportConfig: a.json(),
      bucket: a.string().required(),
    })
    .returns(a.json())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(triggerProcessing)),

  // AI Conversation for policy analysis
  policyChat: a.conversation({
    aiModel: a.ai.model('Claude Sonnet 4.6' as any),
    systemPrompt: 'You are a policy analysis assistant for the 1000 Cities Challenge. You help users understand their policy checklist data and provide insights. The policy data includes policy topics with three criteria per measure: identified (✔/✘/-), aligns (✔/✘/✔✘/-), and measurable (✔/✘/-). Provide clear insights, highlight strengths, identify gaps, suggest improvements, and explain why policies matter for urban health and sustainability.',
  })
    .authorization((allow) => allow.owner()),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});

/*== STEP 2 ===============================================================
Go to your frontend source code. From your client-side code, generate a
Data client to make CRUDL requests to your table. (THIS SNIPPET WILL ONLY
WORK IN THE FRONTEND CODE FILE.)

Using JavaScript or Next.js React Server Components, Middleware, Server 
Actions or Pages Router? Review how to generate Data clients for those use
cases: https://docs.amplify.aws/gen2/build-a-backend/data/connect-to-API/
=========================================================================*/

/*
"use client"
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";

const client = generateClient<Schema>() // use this Data client for CRUDL requests
*/

/*== STEP 3 ===============================================================
Fetch records from the database and use them in your frontend component.
(THIS SNIPPET WILL ONLY WORK IN THE FRONTEND CODE FILE.)
=========================================================================*/

/* For example, in a React component, you can use this snippet in your
  function's RETURN statement */
// const { data: todos } = await client.models.Todo.list()

// return <ul>{todos.map(todo => <li key={todo.id}>{todo.content}</li>)}</ul>
