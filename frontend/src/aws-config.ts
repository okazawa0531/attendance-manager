/**
 * AWS設定ファイル
 * CDKデプロイ後に cdk-outputs.json が生成されます。
 * 本番環境では環境変数またはcdk-outputs.jsonから設定を読み込みます。
 */
import { Amplify } from 'aws-amplify';

interface CdkOutputs {
  AttendanceManagerStack: {
    UserPoolId: string;
    UserPoolClientId: string;
    ApiUrl: string;
    FrontendUrl: string;
    FrontendBucketName: string;
    DistributionId: string;
  };
}

let cdkOutputs: CdkOutputs | null = null;
try {
  // CDKデプロイ時に自動生成されるファイル
  cdkOutputs = (await import('./cdk-outputs.json')).default as CdkOutputs;
} catch {
  // ローカル開発時は環境変数から読み込む
}

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
