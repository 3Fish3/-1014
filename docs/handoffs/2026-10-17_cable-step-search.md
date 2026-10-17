# 线材与剩余附件STEP调查交接

main工作区，四个Gemini分支均已结束，主模型已复核关键来源并汇总。只新增研究文档与.tmp缓存，无CAD下载/建模/业务修改/电气选型/Git写入。既存未提交变更保留。

当前入口：docs/motor-lab/implementation/线材与附件STEP调查结果.md，计划同目录线材与剩余附件STEP调查计划.md。原数据.tmp/motor-lab-cable-step-search/，主模型重新查询缓存以main-前缀区分。

确认具体STEP条目：XT60-F/M立式板端、DM-J4310-2EC V1.1、Soldered USB-UART CH340模块V1.1.1/V1.2.0、IRM-60-xx板载模块、通用船型开关包络；旧中心板原官方资源仍有响应。未下载开模，不当作精密几何/适配或许可验收。

完整CAN/UART/7pin成品线、XT30配对线端、保险座及三相独立线束仍未取得可验证完整源。已有板端内嵌接头或JST系列候选不代表成品线STEP。LRS/急停/CP2102社区线索尚未主模型逐项核具体文件。

重要纠错：USB-UART实际LICENSE.md=TAPR OHL v1.0而非代理CERN引文；JST访问403，未知许可引文和自造7pin商品料号已删除。C615三芯GND/TX/PWM-RX，C板UART非一概只3.3V，四针CAN两端不得凭外形假定直通。旧稿强断言均以顶部主模型复核和正式汇总为准。

下一步：若继续建模，先核定两端接头系列/视图与功能映射，再考虑已有真实接头加程序化柔性线身。当前不新增电源/保护实际BOM或物理接线。其他会话边界和已有模型见2026-10-17_official-models-finish.md。
