import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("DeployMarketsModule", (m) => {
  const fakeUsdc = m.contract("FakeUSDC");
  const factory = m.contract("MarketFactory", [fakeUsdc]);

  return { fakeUsdc, factory };
});