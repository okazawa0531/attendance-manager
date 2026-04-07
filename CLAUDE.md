# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

勤怠管理システム — AWS サーバーレス構成のフルスタックアプリ。

## Repository Structure

```
attendance-manager/
├── cdk/        # AWS CDK インフラ定義（TypeScript）
├── backend/    # Lambda ハンドラー（TypeScript）
├── frontend/   # React SPA（Vite + Tailwind CSS）
└── docs/       # 操作・構築マニュアル
```

## Commands

### CDK

```bash
cd cdk
npm install
cdk deploy --outputs-file ../frontend/src/cdk-outputs.json  # デプロイ（フロントエンド設定も自動生成）
cdk destroy
```

### Backend

```bash
cd backend
npm install
npm run build   # tsc でコンパイル（CDK の NodejsFunction が esbuild でバンドルするため通常不要）
```

### Frontend

```bash
cd frontend
npm install
npm run dev     # ローカル開発サーバー（localhost:5173）
npm run build   # dist/ に出力
npm run lint
```

### デプロイ後のアップロード

```bash
aws s3 sync frontend/dist/ s3://BUCKET_NAME --delete
aws cloudfront create-invalidation --distribution-id DIST_ID --paths "/*"
```

## Architecture

### AWS リソース（`cdk/lib/attendance-stack.ts`）

- **Cognito User Pool**: メール認証、セルフサインアップ無効。グループ: `Admins` / `Users`
- **DynamoDB**: `attendance-users`（PK: userId）、`attendance-records`（PK: userId, SK: date YYYY-MM-DD）
- **Lambda**: `attendance-users`（ユーザーCRUD）、`attendance-records`（勤怠CRUD）
- **API Gateway**: Cognito JWT オーソライザー付き REST API
- **S3 + CloudFront**: フロントエンドSPA ホスティング（OAC認証）

### API ルーティング

| メソッド | パス | 権限 | 処理 |
|---------|------|------|------|
| GET | /users | 管理者のみ | ユーザー一覧 |
| POST | /users | 管理者のみ | ユーザー作成（Cognito + DynamoDB） |
| DELETE | /users/{userId} | 管理者のみ | ユーザー削除 |
| GET | /attendance | 本人or管理者 | 勤怠一覧（year/month クエリ） |
| POST | /attendance | 認証済み | 勤怠登録 |
| PUT | /attendance/{date} | 本人or管理者 | 勤怠更新 |
| DELETE | /attendance/{date} | 本人or管理者 | 勤怠削除 |

### 認証フロー

Lambda は JWT クレームから `cognito:groups` を参照して管理者判定を行う（`backend/src/handlers/`）。API Gateway の Cognito オーソライザーが JWT 検証を担う。

### フロントエンド

- `src/aws-config.ts`: Amplify 初期化。`cdk-outputs.json`（CDKデプロイ時生成）または `.env.local` から設定を読み込む
- `src/App.tsx`: 認証コンテキスト（`AuthContext`）と Cognito グループによるルーティング
- `src/api/client.ts`: API Gateway への認証付きリクエストラッパー
- 管理者 → `/admin`（ユーザー管理）、一般ユーザー → `/user`（打刻・履歴）

### ローカル開発時の環境変数（`frontend/.env.local`）

```
VITE_USER_POOL_ID=ap-northeast-1_xxxxxxxxx
VITE_USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_API_URL=https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/prod
```
