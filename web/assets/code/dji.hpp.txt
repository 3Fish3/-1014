#pragma once
#include "ec/transport/can.hpp"
#include <array>
#include <cstdint>
#include <optional>

namespace ec::drivers {
// 模式决定 CAN ID 和编码范围, 不以电机名字猜测电调当前保存设置.
enum class DjiMode { c610_current, c620_current, gm6020_current, gm6020_voltage };
// 协议满量程不等于机构安全限值; 设备配置与编解码共用此定义.
struct DjiProtocol {
    int limit;
    std::uint16_t first_tx, second_tx, rx_base;
    unsigned count;
};
[[nodiscard]] std::optional<DjiProtocol> dji_protocol(DjiMode mode) noexcept;
// 电流模式下协议满量程 raw 对应的轴侧电流 (C610 10 A / C620 20 A / GM6020 电流 3 A);
// 电压模式没有电流语义, 返回空. 这是协议知识, 不在控制层重复维护.
[[nodiscard]] std::optional<float> dji_current_amp_full_scale(DjiMode mode) noexcept;
struct DjiFeedback {
    std::uint8_t device_id{};
    float rotor_angle_rad{};
    float rotor_speed_rad_s{};
    std::int16_t effort_raw{}; // 电流/转矩原始字段, 不能统一标成 A 或 N·m.
    std::optional<std::uint8_t> temperature_c{};
};
// group=1 对应 ID1–4, group=2 对应 ID5–8; GM6020 无 ID8, 第四槽必须为零.
// 分组发送由总线拥有者合并, 不能让四个设备各自覆盖其余三个槽位.
[[nodiscard]] std::optional<transport::CanFrame> encode_dji(
    DjiMode mode, unsigned group, const std::array<std::int16_t, 4>& raw) noexcept;
[[nodiscard]] std::optional<DjiFeedback> decode_dji(
    DjiMode mode, const transport::CanFrame& frame) noexcept;
} // 命名空间 ec::drivers
