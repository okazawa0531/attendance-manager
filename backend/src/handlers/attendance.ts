import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  DeleteCommand,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import * as res from '../utils/response';

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ATTENDANCE_TABLE = process.env.ATTENDANCE_TABLE!;

function getCallerUserId(event: APIGatewayProxyEvent): string {
  return event.requestContext.authorizer?.claims?.sub || '';
}

function isAdmin(event: APIGatewayProxyEvent): boolean {
  const claims = event.requestContext.authorizer?.claims;
  if (!claims) return false;
  const groups: string = claims['cognito:groups'] || '';
  return groups.includes('Admins');
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const method = event.httpMethod;
  const date = event.pathParameters?.date;

  try {
    if (method === 'GET' && !date) {
      return await listAttendance(event);
    } else if (method === 'POST' && !date) {
      return await createAttendance(event);
    } else if (method === 'PUT' && date) {
      return await updateAttendance(event, date);
    } else if (method === 'DELETE' && date) {
      return await deleteAttendance(event, date);
    }
    return res.notFound('Route not found');
  } catch (err) {
    console.error(err);
    return res.internalError();
  }
}

// GET /attendance?userId=xxx&year=2024&month=4
async function listAttendance(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const callerId = getCallerUserId(event);
  const admin = isAdmin(event);

  const queryUserId = event.queryStringParameters?.userId || callerId;
  const year = event.queryStringParameters?.year;
  const month = event.queryStringParameters?.month;

  // 一般ユーザーは自分のデータのみ取得可能
  if (!admin && queryUserId !== callerId) {
    return res.forbidden();
  }

  let keyConditionExpression = 'userId = :uid';
  const expressionAttributeValues: Record<string, unknown> = { ':uid': queryUserId };

  if (year && month) {
    const paddedMonth = month.padStart(2, '0');
    const prefix = `${year}-${paddedMonth}`;
    keyConditionExpression += ' AND begins_with(#d, :prefix)';
    expressionAttributeValues[':prefix'] = prefix;
  } else if (year) {
    keyConditionExpression += ' AND begins_with(#d, :prefix)';
    expressionAttributeValues[':prefix'] = year;
  }

  const params: Record<string, unknown> = {
    TableName: ATTENDANCE_TABLE,
    KeyConditionExpression: keyConditionExpression,
    ExpressionAttributeValues: expressionAttributeValues,
    ScanIndexForward: false, // 降順（新しい順）
  };

  if (year) {
    params.ExpressionAttributeNames = { '#d': 'date' };
  }

  const result = await ddbClient.send(new QueryCommand(params as Parameters<typeof ddbClient.send>[0]['input']));
  return res.ok({ records: result.Items || [] });
}

// POST /attendance  { date, clockIn, clockOut, breakMinutes, notes, status }
async function createAttendance(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const callerId = getCallerUserId(event);
  const admin = isAdmin(event);
  const body = JSON.parse(event.body || '{}');

  const targetUserId = body.userId && admin ? body.userId : callerId;
  const { date, clockIn, clockOut, breakMinutes, notes, status, workType } = body;

  if (!date) {
    return res.badRequest('date は必須です（YYYY-MM-DD形式）');
  }

  if (!isValidDate(date)) {
    return res.badRequest('date の形式が正しくありません（YYYY-MM-DD）');
  }

  const now = new Date().toISOString();
  const record = {
    userId: targetUserId,
    date,
    clockIn: clockIn || null,
    clockOut: clockOut || null,
    breakMinutes: breakMinutes ?? 60,
    notes: notes || '',
    status: status || 'present',
    workType: workType || null,
    createdAt: now,
    updatedAt: now,
  };

  await ddbClient.send(new PutCommand({ TableName: ATTENDANCE_TABLE, Item: record }));
  return res.created({ record });
}

// PUT /attendance/{date}  { clockIn, clockOut, breakMinutes, notes, status }
async function updateAttendance(event: APIGatewayProxyEvent, date: string): Promise<APIGatewayProxyResult> {
  const callerId = getCallerUserId(event);
  const admin = isAdmin(event);
  const body = JSON.parse(event.body || '{}');

  const targetUserId = body.userId && admin ? body.userId : callerId;

  if (!admin && targetUserId !== callerId) {
    return res.forbidden();
  }

  const existing = await ddbClient.send(new GetCommand({
    TableName: ATTENDANCE_TABLE,
    Key: { userId: targetUserId, date },
  }));

  if (!existing.Item) {
    return res.notFound('勤怠記録が見つかりません');
  }

  const { clockIn, clockOut, breakMinutes, notes, status, workType } = body;
  const updateExpressions: string[] = ['updatedAt = :now'];
  const expressionAttributeValues: Record<string, unknown> = {
    ':now': new Date().toISOString(),
  };
  const expressionAttributeNames: Record<string, string> = {};

  if (clockIn !== undefined) { updateExpressions.push('clockIn = :ci'); expressionAttributeValues[':ci'] = clockIn; }
  if (clockOut !== undefined) { updateExpressions.push('clockOut = :co'); expressionAttributeValues[':co'] = clockOut; }
  if (breakMinutes !== undefined) { updateExpressions.push('breakMinutes = :bm'); expressionAttributeValues[':bm'] = breakMinutes; }
  if (notes !== undefined) { updateExpressions.push('notes = :n'); expressionAttributeValues[':n'] = notes; }
  if (status !== undefined) { updateExpressions.push('#s = :st'); expressionAttributeValues[':st'] = status; expressionAttributeNames['#s'] = 'status'; }
  if (workType !== undefined) { updateExpressions.push('workType = :wt'); expressionAttributeValues[':wt'] = workType; }

  const params: Record<string, unknown> = {
    TableName: ATTENDANCE_TABLE,
    Key: { userId: targetUserId, date },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW',
  };

  if (Object.keys(expressionAttributeNames).length > 0) {
    params.ExpressionAttributeNames = expressionAttributeNames;
  }

  const result = await ddbClient.send(new UpdateCommand(params as Parameters<typeof ddbClient.send>[0]['input']));
  return res.ok({ record: result.Attributes });
}

// DELETE /attendance/{date}
async function deleteAttendance(event: APIGatewayProxyEvent, date: string): Promise<APIGatewayProxyResult> {
  const callerId = getCallerUserId(event);
  const admin = isAdmin(event);
  const queryUserId = event.queryStringParameters?.userId;
  const targetUserId = queryUserId && admin ? queryUserId : callerId;

  if (!admin && targetUserId !== callerId) {
    return res.forbidden();
  }

  await ddbClient.send(new DeleteCommand({
    TableName: ATTENDANCE_TABLE,
    Key: { userId: targetUserId, date },
  }));

  return res.noContent();
}

function isValidDate(dateStr: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}
