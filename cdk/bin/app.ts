#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AttendanceStack } from '../lib/attendance-stack';

const app = new cdk.App();
new AttendanceStack(app, 'AttendanceManagerStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'ap-northeast-1',
  },
  description: '勤怠管理システム - サーバーレスアーキテクチャ',
});
