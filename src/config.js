// 全局尺寸（米）。坐标：X 沿长轴向东，Y 向上，Z 沿短轴向南；原点 = 竞技场中心，竞技场地面 y = 0。
// 数据依据：外轮廓 188 × 156 m；竞技场约 83 × 48 m；外墙高约 48.4 m（四层：10.50 / 11.85 / 11.60 / 14.45）。

export const OUTER = { A: 94, B: 78 };        // 外墙外皮半轴
export const ARENA = { A: 41.5, B: 24 };      // 竞技场半轴（护墙内皮）
export const S_ARENA = 53;                    // 外墙外皮 → 竞技场的“进深”参数
export const BAYS = 80;                       // 开间数（拱门数）

// 外立面各层（y 为层底标高）
export const LEVELS = [
  { name: 'tuscan', y0: 0, y1: 10.5 },
  { name: 'ionic', y0: 10.5, y1: 22.35 },
  { name: 'corinthian', y0: 22.35, y1: 33.95 },
  { name: 'attic', y0: 33.95, y1: 48.4 },
];
export const TOP = 48.4;

// 太阳（方位 0=北 90=东 180=南）
export const SUN = { azimuthDeg: 215, elevationDeg: 52 };
