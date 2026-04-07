/**
 * AWS設定ファイル
 * CDKデプロイ後に cdk-outputs.json が生成されます。
 * ローカル開発時は frontend/.env.local に環境変数を設定してください。
 */
import { Amplify } from 'aws-amplify';
import cdkOutputs from './cdk-outputs.json';

const stack = cdkOutputs?.AttendanceManagerStack;

export const awsConfig = {
  userPoolId: stack?.UserPoolId || import.meta.env.VITE_USER_POOL_ID || '',
  userPoolClientId: stack?.UserPoolClientId || import.meta.env.VITE_USER_POOL_CLIENT_ID || '',
  apiUrl: (stack?.ApiUrl || import.meta.env.VITE_API_URL || '').replace(/\/$/, ''),
};

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: awsConfig.userPoolId,
      userPoolClientId: awsConfig.userPoolClientId,
    },
  },
});
