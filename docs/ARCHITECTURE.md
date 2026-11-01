# 罗马斗兽场三维模型 — 架构与约定

## 坐标与单位
- 1 单位 = 1 米。X 沿长轴向东，Y 向上，Z 沿短轴向南。原点在竞技场中心，竞技场地面 y = 0，广场地面 y = −0.5（外墙下有两级台阶）。
- 西门（凯旋之门）在 −X，东门（死亡之门）在 +X，皇帝包厢在 +Z（南），主办官包厢在 −Z（北）。

## 椭圆族与“弯曲贴合”（src/core/ellipse.js）
- `ring(s, θ)`：进深 s 处（外墙外皮 s = 0，竞技场护墙 s = 53）的点。半轴 `A(s) = 94 − s·KA`，`B(s) = 78 − s·KB`；同一 θ 的点在同一条放射直线上，可直接用作放射墙。
- 开间按外墙外皮的**弧长**等分为 80 份，`bayArc(k) = k·L/80`。k = 0 在东端，k = 20 在南端（皇帝），k = 40 在西端，k = 60 在北端。
- **局部立面坐标**：x 向右（从外面看），y 向上，z 向外（外墙外皮 z = 0，墙内为负，z = −s）。每个开间先在这个平直坐标里建模，再用 `bend(geo, bayArc(k))` 弯曲贴合到椭圆上。弯曲后位置沿放射线、法线沿椭圆法向，UV 自动换成世界尺度（米）的盒式投影。开间越往内越窄，墩柱自然呈楔形。
- 重复构件（柱子、雕像、托座、桅杆、界石）走 InstancedMesh，用 `placeMatrix(s, θ, y)` 摆放：+z 朝外，+x 向右。
- `widthFactor(s)`：进深 s 处 1 米世界长度对应多少局部 x 长度。出入口、楼梯这类需要固定世界宽度的构件要乘这个系数。

## 看台截面（src/model/cavea.js）
- `TIERS` 用 (s, y) 描述各区：前方走道、矮墙高度，以及每排的升高（rise）和进深（run）。截面折线经 `sweepX(..., flip=true)` 扫掠，所以法线朝向竞技场。
- `seatRows()` 输出每排座位的位置，`hasVom` / `hasAisle` 决定哪些开间开出入口、设楼梯。观众摆放与建模共用这些函数，所以座位、出入口和人群不会互相穿插。

## 演员与节目（src/actors）
- `human.js`：关节骨架用 Group 层级搭成，部件为 hips、torso、head 和左右的肩、肘、手、髋、膝、足。正面朝 +Z，用 `animate(h, poseName, dt, speed, walk)` 平滑过渡到 `POSES` 里的姿势，并叠加步态。各兵种装备按 kind 装配。
- `animals.js`：四足动物由躯干、颈、头和两段式腿组成，步态由速度驱动，支持站立（熊）和吼叫（下颌、抬头）。大象有象鼻和耳朵，鸵鸟单独建模。
- `crowd.js`：观众是 InstancedMesh，顶点属性标出手臂、皮肤和头发；着色器根据 `uExcite`（全场情绪）和 `uFocus`（事件方向）计算起身与举手。离中心超过 220 m 时换用低模。
- `show.js`：每个节目是一段可取消的 async 脚本，由 `wait()` / `until()` 按模拟时间推进，`stop()` 时抛出 Cancel。演员每帧朝目标点移动并播放姿势。节目通过 `onEvent` 通知界面更新横幅（stage）和自动讲解（guide）。

## 自检
```bash
node scripts/shot.mjs --page "index.html?view=arena" --out shots/x.png
node scripts/shot.mjs --page "index.html?show=venatio&ui=0" --cam 0,26,10 --tgt 0,0,0 --wait 25000 --out shots/v.png
node scripts/shot.mjs --shots shots/plan1.json        # 多视角
```
`--eval "<js>"` 会在截图前执行页面脚本，例如把镜头对准场上的演员。控制台错误与异常栈会打印到 stdout。

## 性能
- 全场景约 590 万三角面（观众约 3.4 万 × 约 130 面）。建筑按材质和象限合并，大约 400 次绘制调用。
- 观众不投射阴影，但会接收天篷和建筑的阴影。环境光遮蔽默认关闭，用 `?ao=1` 或面板开启。
- 在 RTX 5080 笔记本上，场内视角约 60 fps。
