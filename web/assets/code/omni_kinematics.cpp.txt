#include "ec/motion/omni_kinematics.hpp"
#include <cmath>

namespace ec::motion {
namespace {
constexpr std::size_t wheels = 4;
constexpr std::size_t dims = 3;

bool finite(float v) noexcept { return std::isfinite(v); }

// 一行雅可比: 该轮角速度对 (vx, vy, wz) 的偏导.
std::array<float, dims> row_of(const OmniWheel& wheel) noexcept {
    const float c = std::cos(wheel.roll_dir_rad);
    const float s = std::sin(wheel.roll_dir_rad);
    const float inv = wheel.gain / wheel.radius_m;
    return {c * inv, s * inv, (wheel.x_m * s - wheel.y_m * c) * inv};
}

// 3x3 逆; 行列式相对量级过小视为退化.
bool invert3(const std::array<double, 9>& a, std::array<double, 9>& out) noexcept {
    const double c0 = a[4] * a[8] - a[5] * a[7];
    const double c1 = a[5] * a[6] - a[3] * a[8];
    const double c2 = a[3] * a[7] - a[4] * a[6];
    const double det = a[0] * c0 + a[1] * c1 + a[2] * c2;
    const double trace = (a[0] + a[4] + a[8]) / 3.0;
    if (!std::isfinite(det) || trace <= 0.0 || det <= 1e-6 * trace * trace * trace) { return false; }
    const double inv = 1.0 / det;
    out[0] = c0 * inv;
    out[1] = (a[2] * a[7] - a[1] * a[8]) * inv;
    out[2] = (a[1] * a[5] - a[2] * a[4]) * inv;
    out[3] = c1 * inv;
    out[4] = (a[0] * a[8] - a[2] * a[6]) * inv;
    out[5] = (a[2] * a[3] - a[0] * a[5]) * inv;
    out[6] = c2 * inv;
    out[7] = (a[1] * a[6] - a[0] * a[7]) * inv;
    out[8] = (a[0] * a[4] - a[1] * a[3]) * inv;
    return true;
}
} // 内部辅助函数

bool omni_valid(const OmniDrive& drive) noexcept {
    for (const auto& wheel : drive.wheels) {
        if (!finite(wheel.x_m) || !finite(wheel.y_m) || !finite(wheel.roll_dir_rad) ||
            !finite(wheel.radius_m) || wheel.radius_m <= 0.0f || !finite(wheel.gain) ||
            std::fabs(wheel.gain) <= 0.0f) {
            return false;
        }
    }
    return true;
}

bool omni_well_posed(const OmniDrive& drive) noexcept {
    if (!omni_valid(drive)) { return false; }
    std::array<double, 9> jtj{};
    for (const auto& wheel : drive.wheels) {
        const auto row = row_of(wheel);
        for (std::size_t i = 0; i < dims; ++i) {
            for (std::size_t j = 0; j < dims; ++j) {
                jtj[i * dims + j] += static_cast<double>(row[i]) * static_cast<double>(row[j]);
            }
        }
    }
    std::array<double, 9> inverse{};
    return invert3(jtj, inverse);
}

std::optional<std::array<float, wheels>> omni_wheel_speeds(
    const OmniDrive& drive, const PlanarTwist& twist) noexcept {
    if (!omni_valid(drive) || !finite(twist.vx_mps) || !finite(twist.vy_mps) || !finite(twist.wz_rad_s)) {
        return std::nullopt;
    }
    std::array<float, wheels> out{};
    for (std::size_t i = 0; i < wheels; ++i) {
        const auto row = row_of(drive.wheels[i]);
        out[i] = row[0] * twist.vx_mps + row[1] * twist.vy_mps + row[2] * twist.wz_rad_s;
    }
    return out;
}

std::optional<PlanarTwist> omni_twist(const OmniDrive& drive,
    const std::array<float, wheels>& wheel_rad_s) noexcept {
    if (!omni_valid(drive)) { return std::nullopt; }
    for (auto speed : wheel_rad_s) {
        if (!finite(speed)) { return std::nullopt; }
    }
    std::array<double, 9> jtj{};
    std::array<double, dims> jtw{};
    for (std::size_t i = 0; i < wheels; ++i) {
        const auto wheel_row = row_of(drive.wheels[i]);
        const double speed = wheel_rad_s[i];
        for (std::size_t r = 0; r < dims; ++r) {
            jtw[r] += static_cast<double>(wheel_row[r]) * speed;
            for (std::size_t c = 0; c < dims; ++c) {
                jtj[r * dims + c] += static_cast<double>(wheel_row[r]) * static_cast<double>(wheel_row[c]);
            }
        }
    }
    std::array<double, 9> inverse{};
    if (!invert3(jtj, inverse)) { return std::nullopt; }
    PlanarTwist out{};
    out.vx_mps = static_cast<float>(
        inverse[0] * jtw[0] + inverse[1] * jtw[1] + inverse[2] * jtw[2]);
    out.vy_mps = static_cast<float>(
        inverse[3] * jtw[0] + inverse[4] * jtw[1] + inverse[5] * jtw[2]);
    out.wz_rad_s = static_cast<float>(
        inverse[6] * jtw[0] + inverse[7] * jtw[1] + inverse[8] * jtw[2]);
    return out;
}

float omni_peak_wheel_speed(const OmniDrive& drive, const PlanarTwist& twist) noexcept {
    const auto speeds = omni_wheel_speeds(drive, twist);
    if (!speeds) { return 0.0f; }
    float peak = 0.0f;
    for (auto speed : *speeds) { peak = std::fmax(peak, std::fabs(speed)); }
    return peak;
}
} // 命名空间 ec::motion
