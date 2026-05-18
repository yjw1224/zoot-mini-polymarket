## ZOOT-MINI-POLYMARKET

Project ZOOT는 POLYMARKET과 유사한 예측 시장 플랫폼입니다.
시장 참가자들은 YES 또는 NO에 가상의 fUSDC(fakeUSDT)를 베팅할 수 있습니다.
Chainlink, api 오라클을 통하여 결과를 불러오고, 그에 따라 승패 여부를 결정합니다.

사용자는 지갑을 연결한 후 예치금 (fUSDC)을 내고 새로운 베팅을 만들거나, 다른 사용자가 만든 베팅에 참가할 수 있습니다.

## Sepolia 실행 방법

### 1. 환경 변수 준비

환경 변수를 프런트/백엔드/하드햇으로 분리해서 둡니다.

```bash
# /frontend/.env
VITE_FACTORY_ADDRESS=0x...
VITE_BACKEND_URL=https://silver-enigma-pqvv995g455f6j6-4000.app.github.dev/

# /backend/.env
PORT=4000
HOST=0.0.0.0
RPC_URL=https://...
CHAIN_ID=11155111
FACTORY_ADDRESS=0x...
DATABASE_URL="file:./dev.db"
CORS_ORIGIN=https://silver-enigma-pqvv995g455f6j6-5173.app.github.dev
INDEX_START_BLOCK=0
MATCHER_PRIVATE_KEY=0x... # optional, enables the on-chain matching worker
MATCH_INTERVAL_MS=10000

# /.env
SEPOLIA_RPC_URL=https://...
SEPOLIA_PRIVATE_KEY=0x...
```

각 폴더의 `.env.example`을 복사해서 시작해도 됩니다.

### 2. Sepolia에 배포

```bash
npm run deploy:sepolia
```

배포가 끝나면 출력된 `MarketFactory` 주소를 복사합니다. 이미 배포된 Factory 주소가 있다면 그 값을 `VITE_FACTORY_ADDRESS`에 넣으면 됩니다.

### 3. 백엔드 실행

```bash
cd backend
npm install
npm run prisma:generate
npm run prisma:push
npm run dev
```

`MATCHER_PRIVATE_KEY`를 넣으면 백엔드가 주기적으로 오픈 오더를 체결하려고 시도합니다. 이 계정은 가스비를 낼 수 있어야 하고, 실제 체결 전에 약간의 fUSDC float가 있으면 더 안정적입니다.

### 4. 프런트 실행

```bash
npm run dev
```