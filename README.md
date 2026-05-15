## ZOOT-MINI-POLYMARKET

Project ZOOT는 POLYMARKET과 유사한 예측 시장 플랫폼입니다.
시장 참가자들은 YES 또는 NO에 가상의 fUSDC(fakeUSDT)를 베팅할 수 있습니다.
Chainlink, api 오라클을 통하여 결과를 불러오고, 그에 따라 승패 여부를 결정합니다.

사용자는 지갑을 연결한 후 예치금 (fUSDC)을 내고 새로운 베팅을 만들거나, 다른 사용자가 만든 베팅에 참가할 수 있습니다.

## Sepolia 실행 방법

### 1. 환경 변수 준비

프로젝트 루트에 `.env` 파일을 만들고 아래 값을 넣습니다.

```bash
SEPOLIA_RPC_URL=https://...
SEPOLIA_PRIVATE_KEY=0x...
VITE_FACTORY_ADDRESS=0x...
```

`.env.example`을 그대로 복사해 시작해도 됩니다.

### 2. Sepolia에 배포

```bash
npm run deploy:sepolia
```

배포가 끝나면 출력된 `MarketFactory` 주소를 복사합니다. 이미 배포된 Factory 주소가 있다면 그 값을 `VITE_FACTORY_ADDRESS`에 넣으면 됩니다.

### 3. 프런트 실행

```bash
npm run dev
```

브라우저에서 MetaMask를 Sepolia에 연결한 뒤, Factory 주소가 자동으로 들어오지 않으면 홈 화면에 직접 붙여넣으면 됩니다.