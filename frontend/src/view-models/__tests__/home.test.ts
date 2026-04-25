import { describe, expect, it } from "vitest";
import { mapHomeOverviewViewModel } from "../home";

describe("home overview view model", () => {
  it("puts energy status and source update first for the home energy card", () => {
    const viewModel = mapHomeOverviewViewModel({
      energy_bar: {
        balance: 23.5,
        binding_status: "BOUND",
        monthly_usage: 102,
        refresh_status: "SUCCESS",
        source_updated_at: "2026-04-24T15:40:00Z",
        yearly_usage: 1200,
        yesterday_usage: 8.5,
      },
    });

    expect(viewModel.energyFields.slice(0, 3)).toEqual([
      { label: "状态", value: "已绑定" },
      { label: "本月累计", value: "102 kWh" },
      { label: "账户余额", value: "23.5 元" },
    ]);
    expect(viewModel.railCards.find((card) => card.key === "energy")?.subtitle).toContain(
      "来源更新时间",
    );
    expect(viewModel.bottomStats.map((stat) => stat.label)).toEqual([
      "昨日用电",
      "本月累计",
      "账户余额",
      "年度累计",
    ]);
    expect(viewModel.bottomStats.map((stat) => stat.label)).not.toContain("能耗状态");
    expect(viewModel.bottomStats.map((stat) => stat.label)).not.toContain("刷新状态");
    expect(viewModel.bottomStats.map((stat) => stat.label)).not.toContain("HA 源更新");
  });

  it("points unbound energy state back to settings work", () => {
    const viewModel = mapHomeOverviewViewModel({
      energy_bar: {
        binding_status: "UNBOUND",
        refresh_status: "PENDING",
      },
    });

    expect(viewModel.energyFields[0]).toEqual({ label: "状态", value: "未绑定" });
    expect(viewModel.railCards.find((card) => card.key === "energy")?.title).toBe("等待绑定");
  });
});
