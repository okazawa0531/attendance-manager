import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as path from 'path';

export class AttendanceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ============================================================
    // Cognito User Pool
    // ============================================================
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'attendance-user-pool',
      selfSignUpEnabled: false, // 管理者のみユーザー作成可能
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      userPoolClientName: 'attendance-web-client',
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false,
    });

    // Cognito グループ
    new cognito.CfnUserPoolGroup(this, 'AdminGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'Admins',
      description: '管理者グループ',
    });

    new cognito.CfnUserPoolGroup(this, 'UserGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'Users',
      description: '一般ユーザーグループ',
    });

    // ============================================================
    // DynamoDB Tables
    // ============================================================
    const usersTable = new dynamodb.Table(this, 'UsersTable', {
      tableName: 'attendance-users',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    usersTable.addGlobalSecondaryIndex({
      indexName: 'email-index',
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
    });

    const attendanceTable = new dynamodb.Table(this, 'AttendanceTable', {
      tableName: 'attendance-records',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'date', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ============================================================
    // Lambda Functions
    // ============================================================
    const commonEnv = {
      USERS_TABLE: usersTable.tableName,
      ATTENDANCE_TABLE: attendanceTable.tableName,
      USER_POOL_ID: userPool.userPoolId,
    };

    const lambdaRole = new iam.Role(this, 'LambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    lambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'cognito-idp:AdminCreateUser',
        'cognito-idp:AdminDeleteUser',
        'cognito-idp:AdminAddUserToGroup',
        'cognito-idp:AdminRemoveUserFromGroup',
        'cognito-idp:ListUsers',
        'cognito-idp:AdminGetUser',
        'cognito-idp:AdminSetUserPassword',
      ],
      resources: [userPool.userPoolArn],
    }));

    const backendPath = path.join(__dirname, '../../backend/src');

    const usersFunction = new lambdaNodejs.NodejsFunction(this, 'UsersFunction', {
      functionName: 'attendance-users',
      entry: path.join(backendPath, 'handlers/users.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      role: lambdaRole,
      environment: commonEnv,
      timeout: cdk.Duration.seconds(30),
      bundling: {
        externalModules: ['@aws-sdk/*'],
      },
    });

    const attendanceFunction = new lambdaNodejs.NodejsFunction(this, 'AttendanceFunction', {
      functionName: 'attendance-records',
      entry: path.join(backendPath, 'handlers/attendance.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      role: lambdaRole,
      environment: commonEnv,
      timeout: cdk.Duration.seconds(30),
      bundling: {
        externalModules: ['@aws-sdk/*'],
      },
    });

    usersTable.grantReadWriteData(lambdaRole);
    attendanceTable.grantReadWriteData(lambdaRole);

    // ============================================================
    // API Gateway
    // ============================================================
    const api = new apigateway.RestApi(this, 'AttendanceApi', {
      restApiName: 'attendance-api',
      description: '勤怠管理API',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [userPool],
      identitySource: 'method.request.header.Authorization',
    });

    const authOptions: apigateway.MethodOptions = {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    // /users
    const usersResource = api.root.addResource('users');
    usersResource.addMethod('GET', new apigateway.LambdaIntegration(usersFunction), authOptions);
    usersResource.addMethod('POST', new apigateway.LambdaIntegration(usersFunction), authOptions);

    // /users/{userId}
    const userResource = usersResource.addResource('{userId}');
    userResource.addMethod('DELETE', new apigateway.LambdaIntegration(usersFunction), authOptions);

    // /attendance
    const attendanceResource = api.root.addResource('attendance');
    attendanceResource.addMethod('GET', new apigateway.LambdaIntegration(attendanceFunction), authOptions);
    attendanceResource.addMethod('POST', new apigateway.LambdaIntegration(attendanceFunction), authOptions);

    // /attendance/{date}
    const attendanceDateResource = attendanceResource.addResource('{date}');
    attendanceDateResource.addMethod('PUT', new apigateway.LambdaIntegration(attendanceFunction), authOptions);
    attendanceDateResource.addMethod('DELETE', new apigateway.LambdaIntegration(attendanceFunction), authOptions);

    // ============================================================
    // S3 + CloudFront (フロントエンドホスティング)
    // ============================================================
    const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `attendance-frontend-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const oac = new cloudfront.S3OriginAccessControl(this, 'FrontendOAC', {
      originAccessControlName: 'attendance-frontend-oac',
    });

    const distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(frontendBucket, {
          originAccessControl: oac,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
      defaultRootObject: 'index.html',
    });

    // ============================================================
    // Outputs
    // ============================================================
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      exportName: 'AttendanceUserPoolId',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      exportName: 'AttendanceUserPoolClientId',
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      exportName: 'AttendanceApiUrl',
    });

    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: frontendBucket.bucketName,
      exportName: 'AttendanceFrontendBucket',
    });

    new cdk.CfnOutput(this, 'FrontendUrl', {
      value: `https://${distribution.distributionDomainName}`,
      exportName: 'AttendanceFrontendUrl',
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: distribution.distributionId,
      exportName: 'AttendanceDistributionId',
    });
  }
}
