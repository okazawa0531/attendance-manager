import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminAddUserToGroupCommand,
  ListUsersCommand,
  AdminSetUserPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import * as res from '../utils/response';

const cognitoClient = new CognitoIdentityProviderClient({});
const ddbClient = new DynamoDBDocumentClient(DynamoDBClient.from(new DynamoDBClient({})));

const USER_POOL_ID = process.env.USER_POOL_ID!;
const USERS_TABLE = process.env.USERS_TABLE!;

function isAdmin(event: APIGatewayProxyEvent): boolean {
  const claims = event.requestContext.authorizer?.claims;
  if (!claims) return false;
  const groups: string = claims['cognito:groups'] || '';
  return groups.includes('Admins');
}

function getCallerSub(event: APIGatewayProxyEvent): string {
  return event.requestContext.authorizer?.claims?.sub || '';
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const method = event.httpMethod;
  const userId = event.pathParameters?.userId;

  try {
    if (method === 'GET' && !userId) {
      return await listUsers(event);
    } else if (method === 'POST' && !userId) {
      return await createUser(event);
    } else if (method === 'DELETE' && userId) {
      return await deleteUser(event, userId);
    }
    return res.notFound('Route not found');
  } catch (err) {
    console.error(err);
    return res.internalError();
  }
}

async function listUsers(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  if (!isAdmin(event)) {
    return res.forbidden();
  }

  const result = await ddbClient.send(new ScanCommand({ TableName: USERS_TABLE }));
  return res.ok({ users: result.Items || [] });
}

async function createUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  if (!isAdmin(event)) {
    return res.forbidden();
  }

  const body = JSON.parse(event.body || '{}');
  const { name, email, role, temporaryPassword } = body;

  if (!name || !email || !role || !temporaryPassword) {
    return res.badRequest('name, email, role, temporaryPassword は必須です');
  }
  if (!['admin', 'user'].includes(role)) {
    return res.badRequest('role は admin または user である必要があります');
  }

  const userId = randomUUID();

  // Cognito にユーザーを作成
  await cognitoClient.send(new AdminCreateUserCommand({
    UserPoolId: USER_POOL_ID,
    Username: email,
    TemporaryPassword: temporaryPassword,
    UserAttributes: [
      { Name: 'email', Value: email },
      { Name: 'email_verified', Value: 'true' },
      { Name: 'name', Value: name },
      { Name: 'custom:userId', Value: userId },
    ],
    MessageAction: 'SUPPRESS', // 招待メール送信を抑制
  }));

  // パスワードを永続的に設定（初回変更不要）
  await cognitoClient.send(new AdminSetUserPasswordCommand({
    UserPoolId: USER_POOL_ID,
    Username: email,
    Password: temporaryPassword,
    Permanent: true,
  }));

  // グループに追加
  const groupName = role === 'admin' ? 'Admins' : 'Users';
  await cognitoClient.send(new AdminAddUserToGroupCommand({
    UserPoolId: USER_POOL_ID,
    Username: email,
    GroupName: groupName,
  }));

  // DynamoDB に保存
  const now = new Date().toISOString();
  const user = { userId, name, email, role, createdAt: now, updatedAt: now };
  await ddbClient.send(new PutCommand({ TableName: USERS_TABLE, Item: user }));

  return res.created({ user });
}

async function deleteUser(event: APIGatewayProxyEvent, userId: string): Promise<APIGatewayProxyResult> {
  if (!isAdmin(event)) {
    return res.forbidden();
  }

  // 自分自身の削除を防止
  const callerSub = getCallerSub(event);
  if (callerSub === userId) {
    return res.badRequest('自分自身を削除することはできません');
  }

  // DynamoDB からユーザー情報を取得してメールアドレスを得る
  const scanResult = await ddbClient.send(new ScanCommand({
    TableName: USERS_TABLE,
    FilterExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': userId },
  }));

  const user = scanResult.Items?.[0];
  if (!user) {
    return res.notFound('ユーザーが見つかりません');
  }

  // Cognito からユーザーを削除
  await cognitoClient.send(new AdminDeleteUserCommand({
    UserPoolId: USER_POOL_ID,
    Username: user.email,
  }));

  // DynamoDB から削除
  await ddbClient.send(new DeleteCommand({
    TableName: USERS_TABLE,
    Key: { userId },
  }));

  return res.noContent();
}
