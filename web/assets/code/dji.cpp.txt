#include "ec/drivers/dji.hpp"
#include <numbers>

namespace ec::drivers {
std::optional<DjiProtocol> dji_protocol(DjiMode mode) noexcept {
    switch (mode) {
    case DjiMode::c610_current: return DjiProtocol{10000, 0x200, 0x1ff, 0x200, 8};
    case DjiMode::c620_current: return DjiProtocol{16384, 0x200, 0x1ff, 0x200, 8};
    case DjiMode::gm6020_current: return DjiProtocol{16384, 0x1fe, 0x2fe, 0x204, 7};
    case DjiMode::gm6020_voltage: return DjiProtocol{25000, 0x1ff, 0x2ff, 0x204, 7};
    }
    return std::nullopt;
}
namespace {
// 协议满量程 raw 与满量程轴侧电流的对应; 只对电流模式成立.
std::optional<float> current_full_scale(DjiMode mode) noexcept {
    switch (mode) {
    case DjiMode::c610_current: return 10.0f;
    case DjiMode::c620_current: return 20.0f;
    case DjiMode::gm6020_current: return 3.0f;
    case DjiMode::gm6020_voltage: return std::nullopt;
    }
    return std::nullopt;
}
std::uint16_t u16(std::uint8_t hi, std::uint8_t lo) noexcept {
    return static_cast<std::uint16_t>((static_cast<unsigned>(hi) << 8) | lo);
}
std::int16_t i16(std::uint8_t hi, std::uint8_t lo) noexcept {
    const auto value = u16(hi, lo);
    const auto signed_value = value < 0x8000 ? static_cast<int>(value) : static_cast<int>(value) - 65536;
    return static_cast<std::int16_t>(signed_value);
}
} // 内部辅助函数

std::optional<float> dji_current_amp_full_scale(DjiMode mode) noexcept {
    return current_full_scale(mode);
}

std::optional<transport::CanFrame> encode_dji(
    DjiMode mode, unsigned group, const std::array<std::int16_t, 4>& raw) noexcept {
    const auto spec = dji_protocol(mode);
    if (!spec || (group != 1 && group != 2) ||
        (spec->count == 7 && group == 2 && raw[3] != 0)) {
        return std::nullopt;
    }
    transport::CanFrame frame{group == 1 ? spec->first_tx : spec->second_tx, 8, {}};
    for (unsigned i = 0; i < raw.size(); ++i) {
        if (raw[i] < -spec->limit || raw[i] > spec->limit) { return std::nullopt; }
        const auto bits = static_cast<std::uint16_t>(raw[i]);
        frame.data[2 * i] = static_cast<std::uint8_t>(bits >> 8);
        frame.data[2 * i + 1] = static_cast<std::uint8_t>(bits & 0xff);
    }
    return frame;
}

std::optional<DjiFeedback> decode_dji(DjiMode mode, const transport::CanFrame& frame) noexcept {
    const auto spec = dji_protocol(mode);
    if (!spec || !frame.valid() || frame.size != 8 || frame.id <= spec->rx_base ||
        frame.id > spec->rx_base + spec->count) { return std::nullopt; }
    const auto encoder = u16(frame.data[0], frame.data[1]);
    if (encoder >= 8192) { return std::nullopt; }
    constexpr float tau = 2.0f * std::numbers::pi_v<float>;
    DjiFeedback result{};
    result.device_id = static_cast<std::uint8_t>(frame.id - spec->rx_base);
    result.rotor_angle_rad = static_cast<float>(encoder) * (tau / 8192.0f);
    result.rotor_speed_rad_s = static_cast<float>(i16(frame.data[2], frame.data[3])) * (tau / 60.0f);
    result.effort_raw = i16(frame.data[4], frame.data[5]);
    if (mode != DjiMode::c610_current) { result.temperature_c = frame.data[6]; }
    return result;
}
} // 命名空间 ec::drivers
