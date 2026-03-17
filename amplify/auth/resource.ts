import { defineAuth } from '@aws-amplify/backend';

/**
 * Define and configure your auth resource
 * @see https://docs.amplify.aws/gen2/build-a-backend/auth
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  groups: ['Admins'],
  userAttributes: {
    // 'name' is a standard Cognito attribute available in every User Pool by default —
    // no declaration needed here; it is collected via the sign-up form's formFields config.
    'custom:city': {
      dataType: 'String',
      mutable: true,
    },
    'custom:country': {
      dataType: 'String',
      mutable: true,
    },
    'custom:affiliation': {
      dataType: 'String',
      mutable: true,
    },
    'custom:lat': {
      dataType: 'String',
      mutable: true,
    },
    'custom:lon': {
      dataType: 'String',
      mutable: true,
    },
    'custom:contact_optin': {
      dataType: 'String',
      mutable: true,
    },
  },
});