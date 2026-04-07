# 構築マニュアル

## 前提条件

- AWS CLIがインストール済みで、デプロイ先AWSアカウントに接続されていること
- Node.js 20.x 以上がインストール済みであること
- AWS CDK CLIがインストール済みであること (`npm install -g aws-cdk`)

```bash
# バージョン確認
node --version    # v20.x 以上
aws --version
cdk --version
```

## アーキテクチャ概要

```
[ブラウザ]
   ↓ HTTPS
[CloudFront] → [S3 (フロントエンド静的ファイル)]
   ↓
[API Gateway] → [Lambda (users)] → [DynamoDB: attendance-users]
               → [Lambda (attendance)] → [DynamoDB: attendance-records]
                      ↑ 認証
              [Cognito User Pool]
```

### コスト目安（月額・軽量利用の場合）

| サービス | 目安 |
|---------|------|
| Lambda | 無料枠内（月100万リクエストまで無料） |
| API Gateway | 無料枠内（月100万コールまで無料） |
| DynamoDB | 無料枠内（オンデマンド、軽量利用） |
| S3 | ～$0.01（静的ファイルのみ） |
| CloudFront | 無料枠内（月1TB転送まで無料） |
| Cognito | 無料枠内（月5万MAUまで無料） |
| **合計** | **ほぼ $0**（使用しない月は課金なし） |

---

## セットアップ手順

### 1. リポジトリのクローン・依存関係のインストール

```bash
git clone https://github.com/okazawa0531/attendance-manager.git
cd attendance-manager

# CDK
cd cdk && npm install && cd ..

# バックエンド
cd backend && npm install && cd ..

# フロントエンド
cd frontend && npm install && cd ..
```

### 2. CDK Bootstrap（初回のみ）

AWSアカウント・リージョンで初めてCDKを使用する場合に必要です。

```bash
cd cdk
cdk bootstrap aws://YOUR_ACCOUNT_ID/ap-northeast-1
```

### 3. CDKデプロイ

```bash
cd cdk
npm run deploy
```

デプロイ完了後、ターミナルに以下のOutputsが表示されます：

```
Outputs:
AttendanceManagerStack.ApiUrl = https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/prod/
AttendanceManagerStack.UserPoolId = ap-northeast-1_xxxxxxxxx
AttendanceManagerStack.UserPoolClientId = xxxxxxxxxxxxxxxxxxxxxxxxxx
AttendanceManagerStack.FrontendBucketName = attendance-frontend-xxxxxxxxxxxx-ap-northeast-1
AttendanceManagerStack.FrontendUrl = https://xxxxxxxxxxxx.cloudfront.net
AttendanceManagerStack.DistributionId = XXXXXXXXXXXXXX
```

これらの値は `frontend/src/cdk-outputs.json` に自動保存されます（`npm run deploy` は `--outputs-file` オプション付きで実行されます）。

### 4. フロントエンドのビルドとS3へのアップロード

```bash
cd frontend
npm run build
aws s3 sync dist/ s3://YOUR_BUCKET_NAME --delete
```

### 5. CloudFrontキャッシュの削除

```bash
aws cloudfront create-invalidation \
  --distribution-id YOUR_DISTRIBUTION_ID \
  --paths "/*"
```

### 6. 管理者ユーザーの初回作成

AWSマネジメントコンソール または AWS CLI でCognitoユーザーを作成します。

```bash
# ユーザー作成
aws cognito-idp admin-create-user \
  --user-pool-id YOUR_USER_POOL_ID \
  --username admin@example.com \
  --user-attributes Name=email,Value=admin@example.com Name=email_verified,Value=true Name=name,Value="システム管理者" \
  --message-action SUPPRESS

# パスワードを永続的に設定
aws cognito-idp admin-set-user-password \
  --user-pool-id YOUR_USER_POOL_ID \
  --username admin@example.com \
  --password "YourSecurePassword1" \
  --permanent

# Adminsグループに追加
aws cognito-idp admin-add-user-to-group \
  --user-pool-id YOUR_USER_POOL_ID \
  --username admin@example.com \
  --group-name Admins

# DynamoDBにユーザー情報を登録
aws dynamodb put-item \
  --table-name attendance-users \
  --item '{
    "userId": {"S": "initial-admin"},
    "name": {"S": "システム管理者"},
    "email": {"S": "admin@example.com"},
    "role": {"S": "admin"},
    "createdAt": {"S": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"},
    "updatedAt": {"S": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}
  }'
```

### 7. 動作確認

ブラウザで `FrontendUrl` にアクセスし、管理者アカウントでログインできることを確認します。

---

## 環境削除

すべてのリソースを削除する場合：

```bash
# S3バケットを先に空にする（CDK destroyの前に必要）
aws s3 rm s3://YOUR_BUCKET_NAME --recursive

cd cdk
npm run destroy
```

---

## ローカル開発

フロントエンドをローカルで開発する場合、`.env.local` を作成して環境変数を設定します。

```bash
# frontend/.env.local
VITE_USER_POOL_ID=ap-northeast-1_xxxxxxxxx
VITE_USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_API_URL=https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/prod
```

```bash
cd frontend
npm run dev
```
