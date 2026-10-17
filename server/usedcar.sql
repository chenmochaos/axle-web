-- ============================================================================
-- usedcar.sql —— 把 hmdp 的「本地生活点评」数据就地改造成「二手车平台」数据
-- ============================================================================
--
-- 为什么改的是数据而不是建新库：前端（web/）是**复用** hmdp 的接口契约的，
-- 表名、列名、响应结构一律不变，只把语义从「商铺」换成「车源」、从「餐饮品类」
-- 换成「品牌」。契约不变是这个项目的既定原则，所以这里不新建表、不建新库。
--
-- **本脚本幂等**：连跑两次结果相同，第二次不报错、不改动任何数据。三个手段 ——
--   1. 加列走 `hmdp_add_column()`，先查 information_schema 再决定要不要 ALTER
--      （MySQL 8 的 `ADD COLUMN` 不支持 `IF NOT EXISTS`）
--   2. 灌数据一律 `INSERT ... ON DUPLICATE KEY UPDATE`（主键冲突即改写）
--   3. 秒杀时间窗用 `NOW()` 现算，每次执行都重新对齐到「正在进行中」
--
-- 运行（**必须用 mysql 命令行客户端**，脚本里用了 `DELIMITER`，GUI 工具会解析失败）：
--
--   cd server
--   set -a && . ./.env && set +a          # 取 MYSQL_PASSWORD
--   mysql -udev -p"$MYSQL_PASSWORD" hmdp < usedcar.sql
--
-- `DATABASE()` 依赖当前库，所以命令行里那个 `hmdp` 不能省。
--
-- ── 这个脚本**不删任何一行** ─────────────────────────────────────────────
-- 删数据是红线，所以旧数据一律「就地覆盖」或「下架」，不 DELETE：
--   * `tb_shop` id 1–14：内容整体改写成车源。**id 与前端 mock 的车 id 一一对应**
--     （`mockCars` 的 id 恰好是 1–13），于是 `/car/5`、`/seckill/5` 在 mock 与真机上
--     指向同一台车 —— 验收就是「同一页、两种数据源」。
--   * `tb_shop_type` id 1–10：10 行全部复用为品牌。
--   * `tb_voucher` id 1 / 10（原来的餐饮代金券）：**置 `status = 2`（下架）**。
--     `VoucherMapper.xml` 的 `WHERE v.status = 1` 会把它们挡在接口外，
--     而 `tb_voucher_order` 里那两行早先压测留下的订单仍然指向存在的券，不会变成悬空引用。
--   * `tb_seckill_voucher` 里 voucher 10 那行留着（它的券已下架，无影响）。
--
-- ── 已知的两处「不完美」，是上面那条约束的代价 ──────────────────────────────
--   1. `tb_shop_type` 有 10 行而 mock 只有 8 个品牌，多出的 id 9/10 被复用成
--      保时捷 / 沃尔沃 —— 它们**没有车源**，前端品牌导航点进去是空态列表。
--      （换成删掉这两行就没有空态，但那要先经你同意。）
--   2. 真机 14 台车、mock 13 台（第 14 台 `BMW M 1000 RR` 用的是 mock 里没用到的
--      那张真实照片）。多出来的一台是故意的：`tb_shop` 本来就有 14 行，不删就只能填满。
--
-- ============================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- 0. 加列（幂等）
-- ---------------------------------------------------------------------------

DROP PROCEDURE IF EXISTS hmdp_add_column;
DELIMITER $$
CREATE PROCEDURE hmdp_add_column(IN p_table VARCHAR(64), IN p_column VARCHAR(64), IN p_def TEXT)
BEGIN
  DECLARE v_cnt INT;
  SELECT COUNT(*) INTO v_cnt
    FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = p_table AND column_name = p_column;
  IF v_cnt = 0 THEN
    SET @ddl = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN ', p_def);
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

-- 车辆扩展字段。设计文档 §7.1 列了 6 列，实际是 8 列，多出的两个各有理由：
--   * `kind`   —— 前端 `kindOf()` 是首页大类 tab 与列表筛选的承重件。没有它，真机
--                 路径只能是纯汽车，「全部 / 汽车 / 摩托」那两个 tab 就是死的。
--   * `original_price` —— `CarCard` 与 `CarHero` 都会渲染「新车指导价」。没有它，
--                 真机上这一行静默消失，mock 与真机对不上，Phase 0 的验收判据就废了。
CALL hmdp_add_column('tb_shop', 'mileage',        'mileage DECIMAL(6,1) NULL COMMENT ''里程（万公里）''');
CALL hmdp_add_column('tb_shop', 'register_date',  'register_date VARCHAR(7) NULL COMMENT ''上牌时间 YYYY-MM''');
CALL hmdp_add_column('tb_shop', 'gearbox',        'gearbox VARCHAR(8) NULL COMMENT ''自动/手动，摩托车为 NULL''');
CALL hmdp_add_column('tb_shop', 'fuel',           'fuel VARCHAR(16) NULL COMMENT ''汽油/纯电/混动''');
CALL hmdp_add_column('tb_shop', 'displacement',   'displacement VARCHAR(16) NULL COMMENT ''排量，如 3.0T / 999cc；纯电为 NULL''');
CALL hmdp_add_column('tb_shop', 'owner_count',    'owner_count TINYINT NULL COMMENT ''过户次数''');
CALL hmdp_add_column('tb_shop', 'kind',           'kind VARCHAR(16) NULL DEFAULT ''car'' COMMENT ''car/motorcycle''');
CALL hmdp_add_column('tb_shop', 'original_price', 'original_price BIGINT UNSIGNED NULL COMMENT ''新车指导价，单位：分''');

-- 品牌字标。`tb_shop_type` 只有一个文本列，而品牌需要「中文名 + 拉丁字标」
-- （宝马 / BMW）。加一个可空列，比在适配层里硬编码一张中文→拉丁的映射表干净。
CALL hmdp_add_column('tb_shop_type', 'mark', 'mark VARCHAR(8) NULL COMMENT ''拉丁字标，如 BMW''');

DROP PROCEDURE hmdp_add_column;

-- ---------------------------------------------------------------------------
-- 1. 品牌（原 `tb_shop_type` 的 10 个餐饮品类就地覆盖）
-- ---------------------------------------------------------------------------
-- `count`（平台在售总量）**不在这里** —— 表里没有这一列，适配层也不去编。
-- 前端的 `Brand.count` 是可选的，真机模式下品牌导航只是不显示那个数字。

INSERT INTO tb_shop_type (id, name, mark, icon, sort) VALUES
  (1,  '宝马',        'BMW',    NULL, 1),
  (2,  '梅赛德斯-AMG', 'AMG',    NULL, 2),
  (3,  '奥迪',        'AUDI',   NULL, 3),
  (4,  '特斯拉',      'TESLA',  NULL, 4),
  (5,  '马自达',      'MAZDA',  NULL, 5),
  (6,  '本田',        'HONDA',  NULL, 6),
  (7,  '铃木',        'SUZUKI', NULL, 7),
  (8,  '春风动力',    'CFMOTO', NULL, 8),
  -- 9/10 是「不删行」的代价：没有车源，点进去是空态。见文件头的说明。
  (9,  '保时捷',      'PORSCHE', NULL, 9),
  (10, '沃尔沃',      'VOLVO',   NULL, 10)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), mark = VALUES(mark), icon = VALUES(icon), sort = VALUES(sort);

-- ---------------------------------------------------------------------------
-- 2. 车源（`tb_shop`，id 1–13 与前端 mock 的车 id 完全一致）
-- ---------------------------------------------------------------------------
-- 字段口径（每一条都是「不这样做就会静默出错」的那种）：
--
--   * `avg_price` / `original_price` **单位是分** —— 这是 hmdp 的原语义，不改。
--     适配层负责除以 100。改成「元」会静默破坏后端契约。
--   * `score` 是**评分 × 10 的整数**（4.7 分 → 47），`tb_shop.score` 是
--     `int(2) UNSIGNED ZEROFILL`，写 4.7 会被截成 5。
--   * `sold` / `comments` 同样是 ZEROFILL 整型；`comments` 前端不读
--     （`Car` 里没有这个字段），按销量估一个量级填上，不编精确值。
--   * `images` 写**前端相对路径**（`/cars/xxx.jpg`），不是 nginx 绝对 URL ——
--     这些图在前端仓库的 `public/cars/` 下，相对路径直接命中前端 origin。
--     多个用逗号分隔（后端这一列是逗号串，前端 `Car.images` 是数组，适配层拆）。
--   * `gearbox` 对摩托车留 NULL：`自动/手动` 是汽车的分类法，摩托是国际挡序列
--     变速箱，硬塞进这两档是错的数据（mock 同理）。
--   * `x` / `y` 按各自 `address` 所在城市给真实坐标，**并且刻意集中**：
--     14 台车只落在 3 个城市（上海 5 / 北京 5 / 深圳 4），同城车辆彼此都在
--     2 km 上下。原因是 `/car/list` 的半径**硬编码 5 km**
--     （`CarServiceImpl.java` 的 `new Distance(5000)`），原先 14 台散在 8 个城市、
--     很多城市只有 1 台 —— 「附近优先」在任何城市都只能查出 1 台，看起来像坏了。
--     集中之后同城 4–5 台相互都在半径内，这个开关才演示得出来。
--     **改了这里就必须同步改 `web/src/api/mock.ts` 的 `mockCarCoords`**，
--     否则 mock 与真机的「附近」结果对不上（`car.ts` 的 `nearbyCars` 用同一套半径现算距离）。
--   * `cutout`（首屏抠图）**没有列，也不该有**：那是前端 `public/cars/cut/` 的
--     命名约定，由适配层的 `cutoutOf()` 推导，不是后端数据。

INSERT INTO tb_shop
  (id, name, type_id, images, area, address, x, y, avg_price, sold, comments, score, open_hours,
   mileage, register_date, gearbox, fuel, displacement, owner_count, kind, original_price)
VALUES
  -- ── id 1–13：逐字段对齐 web/src/api/mock.ts 的 mockCars ──────────────
  (1,  'Manhart MH4 GTR II', 1, '/cars/manhart-mh4-gtr-ii.jpg', NULL,
   '上海市黄浦区人民大道 200 号', 121.4737, 31.2304,
   188000000, 1286, 321, 49, NULL, 0.6, '2022-05', '自动', '汽油', '3.0T', 0, 'car', 218000000),

  (2,  'BMW S 1000 RR', 1, '/cars/bmw-s-1000-rr.jpg', NULL,
   '上海市黄浦区南京东路 300 号', 121.4825, 31.2350,
   16800000, 412, 103, 48, NULL, 0.4, '2023-04', NULL, '汽油', '999cc', 0, 'motorcycle', 21900000),

  (3,  'Mercedes-AMG GT 63 S 4MATIC+', 2, '/cars/amg-gt-63s.jpg', NULL,
   '上海市徐汇区衡山路 890 号', 121.4420, 31.2180,
   168000000, 604, 151, 45, NULL, 2.1, '2020-08', '自动', '汽油', '4.0T', 2, 'car', 204800000),

  (4,  'CFMoto 675SR', 8, '/cars/cfmoto-675sr.jpeg', NULL,
   '广东省深圳市南山区深南大道 9988 号', 113.9520, 22.5350,
   4580000, 968, 242, 49, NULL, 0.3, '2024-06', NULL, '汽油', '675cc', 0, 'motorcycle', 5180000),

  (5,  'BMW M4 Competition (Vorsteiner)', 1, '/cars/bmw-m4-vorsteiner.jpg', NULL,
   '广东省深圳市南山区科苑南路 2666 号', 113.9447, 22.5293,
   98800000, 733, 183, 47, NULL, 1.4, '2021-07', '自动', '汽油', '3.0T', 1, 'car', 119800000),

  (6,  'BMW M4 CSL', 1, '/cars/bmw-m4-csl.jpeg', NULL,
   '北京市朝阳区建国路 87 号', 116.4660, 39.9097,
   158000000, 3421, 855, 50, NULL, 0.5, '2022-11', '自动', '汽油', '3.0T', 0, 'car', 188000000),

  (7,  'Mercedes-AMG GT Black Series', 2, '/cars/amg-gt-black-series.jpg', NULL,
   '上海市静安区南京西路 1266 号', 121.4524, 31.2272,
   368000000, 1877, 469, 50, NULL, 0.4, '2021-09', '自动', '汽油', '4.0T', 0, 'car', 398000000),

  (8,  'Audi RS6 GT', 3, '/cars/audi-rs6-gt.jpg', NULL,
   '广东省深圳市南山区后海大道 2388 号', 113.9380, 22.5230,
   198000000, 967, 241, 48, NULL, 1.1, '2023-02', '自动', '汽油', '4.0T', 1, 'car', 238000000),

  (9,  'Tesla Model S Plaid', 4, '/cars/model-s-2.jpg', NULL,
   '上海市虹口区四川北路 1688 号', 121.4900, 31.2520,
   78000000, 2210, 552, 47, NULL, 2.6, '2022-01', '自动', '纯电', NULL, 0, 'car', 105900000),

  -- 唯一一台**真图集**：两张是同一次拍摄、同一台车（详情页的缩略图条靠它）。
  (10, 'Mazda MX-5 (ND)', 5, '/cars/mazda-mx5.jpeg,/cars/mx5(1).jpeg', NULL,
   '广东省深圳市南山区滨海大道 3001 号', 113.9580, 22.5210,
   23800000, 528, 132, 46, NULL, 1.8, '2020-05', '手动', '汽油', '2.0L', 1, 'car', 33900000),

  (11, 'Mazda3 昂克赛拉', 5, '/cars/mazda3.jpeg', NULL,
   '北京市朝阳区三里屯路 19 号', 116.4880, 39.9180,
   9800000, 418, 104, 44, NULL, 3.4, '2019-09', '自动', '汽油', '2.0L', 2, 'car', 15900000),

  (12, 'Honda CBR1000RR-R Fireblade SP', 6, '/cars/honda-cbr1000rr-r-fireblade.jpg', NULL,
   '北京市朝阳区东三环中路 39 号', 116.4750, 39.9000,
   25800000, 236, 59, 49, NULL, 0.6, '2023-08', NULL, '汽油', '1000cc', 0, 'motorcycle', 31900000),

  (13, 'Suzuki GSX250R', 7, '/cars/suzuki-gsx250r.jpeg', NULL,
   '北京市东城区崇文门外大街 8 号', 116.4480, 39.9020,
   1880000, 174, 43, 45, NULL, 0.9, '2022-10', NULL, '汽油', '248cc', 1, 'motorcycle', 2480000),

  -- ── id 14：第 14 行。`tb_shop` 本来就有 14 行，不删就得填满 ────────────────
  -- 用的是一张 mock 没用到的真实照片（`public/cars/bmw-m-1000-rr-…jpg`），
  -- 不拿别的车的图凑数。所以真机 14 台、mock 13 台，差的就是这一台。
  (14, 'BMW M 1000 RR', 1, '/cars/bmw-m-1000-rr-7680x5604-26484.jpg', NULL,
   '北京市东城区朝阳门北大街 8 号', 116.4400, 39.9200,
   26800000, 291, 72, 48, NULL, 0.3, '2024-03', NULL, '汽油', '999cc', 0, 'motorcycle', 33800000)
ON DUPLICATE KEY UPDATE
  name           = VALUES(name),
  type_id        = VALUES(type_id),
  images         = VALUES(images),
  area           = VALUES(area),
  address        = VALUES(address),
  x              = VALUES(x),
  y              = VALUES(y),
  avg_price      = VALUES(avg_price),
  sold           = VALUES(sold),
  comments       = VALUES(comments),
  score          = VALUES(score),
  open_hours     = VALUES(open_hours),
  mileage        = VALUES(mileage),
  register_date  = VALUES(register_date),
  gearbox        = VALUES(gearbox),
  fuel           = VALUES(fuel),
  displacement   = VALUES(displacement),
  owner_count    = VALUES(owner_count),
  kind           = VALUES(kind),
  original_price = VALUES(original_price);

-- ---------------------------------------------------------------------------
-- 3. 购车券（`tb_voucher` / `tb_seckill_voucher`）
-- ---------------------------------------------------------------------------
-- 原来的两张餐饮代金券（id 1、10）**下架**而不是删除。`VoucherMapper.xml` 的
-- `WHERE v.status = 1` 会把它们挡在 `/voucher/list/{shopId}` 之外，接口干净了，
-- 而 `tb_voucher_order` 里那两行历史订单仍然指向存在的券。
UPDATE tb_voucher SET status = 2 WHERE id IN (1, 10);

-- 下面是前端 mock 的四张券，字段逐一对齐 mock.ts。id 也从 mock 抄，
-- 这样「同一页两种数据源」连券号都一致。
INSERT INTO tb_voucher
  (id, shop_id, title, sub_title, rules, pay_value, actual_value, type, status)
VALUES
  (101, 5, '限时特价 · 意向金抵 1 万', '本周限量 50 张，到店核销',
   '到店核销\n可无条件退\n每人限购 1 张\n不与门店其他优惠叠加',
   9900, 1000000, 1, 1),

  -- 普通券（type = 0）：`tb_seckill_voucher` 里**没有**对应行，
  -- 所以 `/voucher/list/{shopId}` 的 LEFT JOIN 会给它 null 的 stock/beginTime/endTime。
  -- 前端据此判断「这不是秒杀券」，详情页因此不出底部抢购条。
  (102, 5, '免费全车检测券', '含漆膜仪与举升机检测',
   '需提前 1 天预约\n单次到店有效',
   0, 68000, 0, 1),

  (103, 12, '限时特价 · 骑行装备金抵 5000', '限量 200 张',
   '到店核销\n可无条件退\n每人限购 1 张',
   5000, 500000, 1, 1),

  -- 车 10（Mazda MX-5）**只有普通券、没有秒杀** —— 详情页应当渲染券区块但不出抢购条。
  -- 这个分支需要有真车兜住，否则从没被人眼看过。
  (104, 10, '首年延保抵扣券', '抵 3000 元延保费用',
   '随车购买延保时抵扣\n不可折现',
   19900, 300000, 0, 1),

  -- 105 是**已结束**的秒杀券：前端「已结束」态与「有券但不出抢购条」都靠它才演得出来。
  -- status 仍是 1（上架）—— 过期的判据是时间窗，不是上下架状态。
  (105, 3, '限时特价 · 赛道体验日', '限量 20 张',
   '含赛道日门票 1 张\n需提前 3 天预约',
   39900, 800000, 1, 1)
ON DUPLICATE KEY UPDATE
  shop_id      = VALUES(shop_id),
  title        = VALUES(title),
  sub_title    = VALUES(sub_title),
  rules        = VALUES(rules),
  pay_value    = VALUES(pay_value),
  actual_value = VALUES(actual_value),
  type         = VALUES(type),
  status       = VALUES(status);

-- 秒杀库存与时间窗。时间窗用 `NOW()` 现算而不是写死日期 ——
-- 写死一个 ISO 日期看着更像真数据，但它会过期，而过期的表现是
-- 「限时特价区块和抢购条静默消失」：不报错、不警告，下次打开就没了。
-- 105 例外，它**故意是过去**的窗口，用来演示「已结束」。
--
-- 这里的 stock 只是 MySQL 侧的真相；秒杀实际扣的是 Redis 的 `seckill:stock:{id}`，
-- 要跑 `scripts/init-seckill-stock.sh` 灌进去，否则抢购一律返回
-- 「优惠券不存在或库存未预热」。
INSERT INTO tb_seckill_voucher (voucher_id, stock, begin_time, end_time) VALUES
  (101, 50,  DATE_SUB(NOW(), INTERVAL 3 DAY),  DATE_ADD(NOW(), INTERVAL 7 DAY)),
  (103, 200, DATE_SUB(NOW(), INTERVAL 1 DAY),  DATE_ADD(NOW(), INTERVAL 14 DAY)),
  (105, 20,  DATE_SUB(NOW(), INTERVAL 30 DAY), DATE_SUB(NOW(), INTERVAL 10 DAY))
ON DUPLICATE KEY UPDATE
  stock      = VALUES(stock),
  begin_time = VALUES(begin_time),
  end_time   = VALUES(end_time);

-- ---------------------------------------------------------------------------
-- 4. 自检：跑完应该正好 14 台车、10 个品牌、5 张在架券、3 张秒杀券
-- ---------------------------------------------------------------------------
SELECT
  (SELECT COUNT(*) FROM tb_shop)                              AS shops,
  (SELECT COUNT(*) FROM tb_shop_type)                          AS brands,
  (SELECT COUNT(*) FROM tb_shop WHERE kind = 'motorcycle')      AS motorcycles,
  (SELECT COUNT(*) FROM tb_voucher WHERE status = 1)            AS vouchers_on_sale,
  (SELECT COUNT(*) FROM tb_seckill_voucher)                     AS seckill_rows;
