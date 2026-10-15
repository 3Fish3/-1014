#pragma once
#include <array>
#include <cstddef>
#include <optional>

namespace ec::motion {
// 平面 twist: 机体坐标系线速度与绕 Z 轴角速度 (右手系, 逆时针为正).
struct PlanarTwist {
    float vx_mps{};
    float vy_mps{};
    float wz_rad_s{};
};

// 一个全向轮的几何与传动参数, 全部来自机械装配, 不在此处硬编码任何角度或尺寸:
// - 轮心位置是相对旋转中心的机体坐标 (m);
// - 滚动方向是轮子在地面滚动方向在机体平面内的方向角 (rad, 绕 +Z 从 +X 起算),
//   也就是"接触点速度在该方向上必须等于 radius * 轮角速度";
// - radius 是全向轮有效滚动半径 (m);
// - gain 是电机到该轮的方向与传动比符号 (+1/-1).
struct OmniWheel {
    float x_m{};
    float y_m{};
    float roll_dir_rad{};
    float radius_m{};
    float gain{1.0f};
};

// 四轮布局. 四轮是当前需求, 但公式对任意轮数成立, 逆解用最小二乘.
struct OmniDrive {
    std::array<OmniWheel, 4> wheels{};
};

[[nodiscard]] bool omni_valid(const OmniDrive& drive) noexcept;
// 布局是否非退化: 三个自由度都能被四个轮子独立观测, 且正解唯一.
[[nodiscard]] bool omni_well_posed(const OmniDrive& drive) noexcept;

// 正解 (twist → 轮角速度): w_i = ((v + omega x r_i) . d_i) / radius_i * gain_i
[[nodiscard]] std::optional<std::array<float, 4>> omni_wheel_speeds(
    const OmniDrive& drive, const PlanarTwist& twist) noexcept;

// 逆解 (轮角速度 → twist): 对 w = J * twist 做最小二乘, 用 (J^T J)^-1 J^T.
// 布局退化时返回空; 轮速互相矛盾(非可达组合)时返回最小二乘意义下的最接近解.
[[nodiscard]] std::optional<PlanarTwist> omni_twist(
    const OmniDrive& drive, const std::array<float, 4>& wheel_rad_s) noexcept;

// 给定轮速上限时, 求该 twist 需要的最大轮角速度绝对值: 用于调用方自行做缩放或限幅.
[[nodiscard]] float omni_peak_wheel_speed(const OmniDrive& drive, const PlanarTwist& twist) noexcept;
} // 命名空间 ec::motion
