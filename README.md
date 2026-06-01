## ZOOT-MINI-POLYMARKET

Project ZOOT는 POLYMARKET과 유사한 예측 시장 플랫폼입니다.
시장 참가자들은 YES 또는 NO 포지션에 가상의 fUSDC(fakeUSDT)를 베팅하거나 유동성을 공급할 수 있습니다.
Chainlink, api 오라클을 통하여 결과를 불러오고, 그에 따라 승패 여부를 결정합니다.

이 프로젝트의 거래 방식은 오더북 매칭이 아니라 AMM(Constant Product) 방식입니다.
YES 풀과 NO 풀이 `YES * NO = k` 관계를 유지하도록 설계되어, 각 풀의 잔고 비율로 가격이 실시간 산출됩니다.
거래가 발생하면 한쪽 풀은 줄고 다른 쪽 풀은 늘어나며, 그 변화량에 따라 체결 수량과 슬리피지가 자동으로 계산됩니다.

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

백엔드는 AMM 풀 상태, 주문/거래 기록, 정산 상태를 관리합니다.
별도의 오더북 매칭 워커는 필요하지 않으며, 가격과 수량은 YES/NO 풀의 비율과 `YES * NO = k` invariant를 기준으로 계산됩니다.

참고로, 한쪽 풀의 잔고가 커질수록 해당 방향의 가격은 낮아지고 반대 방향 가격은 높아집니다.
즉, 사용자는 현재 풀 상태에 따라 체결 가격과 예상 수량을 즉시 확인할 수 있습니다.

### 4. 프런트 실행

```bash
npm run dev
```