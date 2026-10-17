# 线材与附件STEP调查结果

## 本轮结论

4个Gemini分支已全部结束，主模型对关键目录重新请求复核。仅资源调查，未下载CAD、未建模、未选电气BOM、未改变实验台或硬件，未提交推送。工作区main，原先未提交成果保留。

| 对象 | 当前证据级别 | 结论/缺口 |
|---|---|---|
| XT60-F/M立式板端 | 主模型精确API查询200，total2，含STEP URL/SHA | 有具体STEP；不是已核线端插头或完整成品线 |
| XT30板端 | 中心板2既有总装的内嵌接头标签 | 有几何；线端配对插头具体STEP未核实 |
| 三相接头 | 既有M3508/C620总装中含线与端头几何 | 独立型号/配对及整条延长线STEP未核实 |
| CAN、UART、7-pin成品线 | 本轮未取得具体完整线束STEP | 不代表未发布；不能以插头系列候选当整线完成 |
| JST GH线端候选 | 有系列检索线索，所列官网主模型访问403 | 具体型号/STEP格式/登录要求/配接及许可未核，保持候选 |
| DM-J4310-2EC V1.1 | 主模型精确API200，有STEP及GLB URL/SHA | 已找到具体资源，未开模/核实物修订；V1.2未核到具体源 |
| 旧中心板 | 官方原CDN链HEAD响应，已有产品索引对应 | 有STEP；不与中心板2混用，文件时间不证明硬件冻结 |
| Soldered CH340 USB-UART模块 | 主模型GitHub完整tree确认两版.step文件 | 有V1.1.1/V1.2.0几何候选；实际逻辑电平/引脚/适配待核 |
| IRM-60-xx | 主模型精确API200，有STEP URL | 板载AC/DC封装，不是批准作为M3508实验电源 |
| 通用船型开关包络 | 主模型精确API200，有STEP URL | 仅通用外形包络，不认证实际电气等级/精密卡扣公差 |
| LRS-350电源、急停、CP2102模块 | 分支给出产品/社区线索，主模型尚未确认具体文件 | 保留待复核，不计为已验收可用STEP |
| 保险座 | 本轮未确认具体对应STEP | 与保险元件封装分开，待定具体型号再查 |

## 已主模型核验的入口

- XT60：<https://api.step.parts/v1/parts?q=XT60&pageSize=10>
- 达妙V1.1：<https://api.step.parts/v1/parts/damiao_dm_j4310_2ec_v1_1>
- USB-UART模块仓库：<https://github.com/SolderedElectronics/USB-UART-CH340C-converter-board-hardware-design>
  - `OUTPUTS/V1.1.1/USB-UART CH340 converter board 3D.step`
  - `OUTPUTS/V1.2.0/USB-UART CH340 converter board 3D.step`
- IRM：<https://api.step.parts/v1/parts/converter_acdc_meanwell_irm_60_xx_tht>
- 开关包络：<https://api.step.parts/v1/parts/rocker_switch_standard_envelope>

## 关键纠错与边界

- USB-UART仓库LICENSE.md实际是TAPR OHL v1.0，代理初稿CERN许可错误已纠正。许可范围/义务仍需按具体资产核查，不直接许可公开发布。
- JST候选原稿无出处的许可引文和自造RM-M3508-CABLE料号已删除；未经主模型核验的登录/STEP断言不提升证据。
- C板UART手册支持3.3V/5V，不一概说只3.3V；模块供电跳线不自动改变TX/RX逻辑。7-pin只称电机专用数据，不臆造内部信号。
- C615三芯是GND/TX/PWM-RX，不是通用信号/电源/地，也不是已核C板UART线。
- C板与中心板2四针定义与观察方向需分别核对，不能从外形认定任意直通；本调查不提供现场逐针施工图。

## 下一步建议（尚未开始）

优先做单电机闭环需要的线材：从已核总装保留设备端几何，补核线端配对接头；如果完整线STEP继续未检得，可在取得正确两端几何后程序化生成柔性线身，但先把端口定义/连接方向锁定并显式保留未知逐针。

电源保护/UART实际型号未定，不因为候选模型好找就擅自选型。4310与旧中心板属于扩展项，不阻塞当前M3508+C620接线。

原始分支记录与主模型缓存位于`.tmp/motor-lab-cable-step-search/`，各findings顶部主模型说明优先于后面的初稿推论。调查计划见[线材与剩余附件STEP调查计划](线材与剩余附件STEP调查计划.md)。
